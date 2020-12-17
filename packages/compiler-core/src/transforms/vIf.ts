import { PatchFlagNames, PatchFlags } from '@vue/shared'
import {
  AttributeNode,
  BlockCodegenNode,
  CacheExpression,
  ConstantTypes,
  createCallExpression,
  createConditionalExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  createVNodeCall,
  DirectiveNode,
  ElementNode,
  ElementTypes,
  IfBranchNode,
  IfConditionalExpression,
  IfNode,
  locStub,
  NodeTypes,
  SimpleExpressionNode
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import {
  CREATE_BLOCK,
  CREATE_COMMENT,
  FRAGMENT,
  OPEN_BLOCK
} from '../runtimeHelpers'
import {
  createStructuralDirectiveTransform,
  TransformContext,
  traverseNode
} from '../transform'
import { findDir, findProp, injectProp } from '../utils'
import { validateBrowserExpression } from '../validateExpression'
import { processExpression } from './transformExpression'

export const transformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  (node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
      // #1587: We need to dynamically increment the key based on the current
      // node's sibling nodes, since chained v-if/else branches are
      // rendered at the same depth
      // 这里讲的是，必须给兄弟节点一个动态递增的 `key` 属性，因为 v-if/else 分支
      // 会在同一级渲染

      // 取出分支的所有兄弟，这里面包含它自己
      const siblings = context.parent!.children
      let i = siblings.indexOf(ifNode)
      let key = 0
      while (i-- >= 0) {
        const sibling = siblings[i]
        if (sibling && sibling.type === NodeTypes.IF) {
          key += sibling.branches.length
        }
      }

      // Exit callback. Complete the codegenNode when all children have been
      // transformed.
      // exitFns 中的 exitFn ，到这里的时候说明分支节点的所有 children 都被 traverse
      // 过了，因此这里就可以直接返回对应的 codegenNode 了
      return () => {
        if (isRoot) {
          ifNode.codegenNode = createCodegenNodeForBranch(
            branch,
            key,
            context
          ) as IfConditionalExpression
        } else {
          // attach this branch's codegen node to the v-if root.
          const parentCondition = getParentCondition(ifNode.codegenNode!)
          parentCondition.alternate = createCodegenNodeForBranch(
            branch,
            key + ifNode.branches.length - 1,
            context
          )
        }
      }
    })
  }
)

// target-agnostic transform used for both Client and SSR
export function processIf(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (
    node: IfNode,
    branch: IfBranchNode,
    isRoot: boolean
  ) => (() => void) | undefined
) {
  // 不是 v-else 且没有表达式的情况，非法的情况，如： <div v-if></div>
  if (
    dir.name !== 'else' &&
    (!dir.exp || !(dir.exp as SimpleExpressionNode).content.trim())
  ) {
    const loc = dir.exp ? dir.exp.loc : node.loc
    context.onError(
      createCompilerError(ErrorCodes.X_V_IF_NO_EXPRESSION, dir.loc)
    )
    // 默认表达式的值为 true -> <div v-if="true" ...
    dir.exp = createSimpleExpression(`true`, false, loc)
  }

  if (!__BROWSER__ && context.prefixIdentifiers && dir.exp) {
    // dir.exp 只能是简单的表达式，因为 vIf transform 在 transformExpression 之前应用
    dir.exp = processExpression(dir.exp as SimpleExpressionNode, context)
  }

  if (__DEV__ && __BROWSER__ && dir.exp) {
    // 检测是不是有效的表达式，直接 new Function(code) 有没报错就知道对不对
    validateBrowserExpression(dir.exp as SimpleExpressionNode, context)
  }

  if (dir.name === 'if') {
    // v-if 分支
    const branch = createIfBranch(node, dir)
    const ifNode: IfNode = {
      type: NodeTypes.IF,
      loc: node.loc,
      branches: [branch]
    }

    // 替换原来的节点
    context.replaceNode(ifNode)

    if (processCodegen) {
      return processCodegen(ifNode, branch, true)
    }
  } else {
    // v-else, v-else-if 分支
    // locate the adjacent v-if
    const siblings = context.parent!.children
    const comments = []
    let i = siblings.indexOf(node)
    // 一直往回找到 v-if 节点
    while (i-- >= -1) {
      const sibling = siblings[i]
      // 开发模式忽略注释，但缓存将来需要回复，生产模式不需要注释
      if (__DEV__ && sibling && sibling.type === NodeTypes.COMMENT) {
        context.removeNode(sibling)
        comments.unshift(sibling)
        continue
      }

      // 空文本内容，直接删除
      if (
        sibling &&
        sibling.type === NodeTypes.TEXT &&
        !sibling.content.trim().length
      ) {
        context.removeNode(sibling)
        continue
      }

      if (sibling && sibling.type === NodeTypes.IF) {
        // 找到目标节点
        context.removeNode()
        const branch = createIfBranch(node, dir)
        if (__DEV__ && comments.length) {
          branch.children = [...comments, ...branch.children]
        }

        // check if user is forcing same key on different branches
        // 在不同分支上应用了同一个 `key`
        if (__DEV__ || !__BROWSER__) {
          const key = branch.userKey
          if (key) {
            sibling.branches.forEach(({ userKey }) => {
              if (isSameKey(userKey, key)) {
                context.onError(
                  createCompilerError(
                    ErrorCodes.X_V_IF_SAME_KEY,
                    branch.userKey!.loc
                  )
                )
              }
            })
          }
        }

        sibling.branches.push(branch)
        const onExit = processCodegen && processCodegen(sibling, branch, false)
        // since the branch was removed, it will not be traversed.
        // make sure to traverse here.
        // 分支节点被上面删除，所以要手动 traverse 该节点
        traverseNode(branch, context)
        // call on exit
        if (onExit) onExit()
        // make sure to reset currentNode after traversal to indicate this
        // node has been removed.
        // 标识当前节点被删除了， traverseNode 中会用到
        context.currentNode = null
      } else {
        context.onError(
          createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, node.loc)
        )
      }

      break
    }
  }
}

function createIfBranch(node: ElementNode, dir: DirectiveNode): IfBranchNode {
  return {
    type: NodeTypes.IF_BRANCH,
    loc: node.loc,
    // condition ? v-if node : v-else node
    condition: dir.name === 'else' ? undefined : dir.exp,
    // 如果用的是 <template v-if="condition" ... 就需要 node.children
    // 因为 template 本身是不该被渲染的
    children:
      node.tagType === ElementTypes.TEMPLATE && !findDir(node, 'for')
        ? node.children
        : [node],
    // 对于 v-for, v-if/... 都应该给它个 key, 这里是用户编写是的提供的唯一 key
    // 如果没有解析器会默认生成一个全局唯一的 key
    userKey: findProp(node, `key`)
  }
}

function createCodegenNodeForBranch(
  branch: IfBranchNode,
  keyIndex: number,
  context: TransformContext
): IfConditionalExpression | BlockCodegenNode {
  if (branch.condition) {
    return createConditionalExpression(
      branch.condition,
      createChildrenCodegenNode(branch, keyIndex, context),
      // make sure to pass in asBlock: true so that the comment node call
      // closes the current block.
      createCallExpression(context.helper(CREATE_COMMENT), [
        __DEV__ ? '"v-if"' : '""',
        'true'
      ])
    ) as IfConditionalExpression
  } else {
    return createChildrenCodegenNode(branch, keyIndex, context)
  }
}

function createChildrenCodegenNode(
  branch: IfBranchNode,
  keyIndex: number,
  context: TransformContext
): BlockCodegenNode {
  const { helper } = context

  // 给每个分支加一个 `key` 属性
  const keyProperty = createObjectProperty(
    `key`,
    createSimpleExpression(
      `${keyIndex}`,
      false,
      locStub,
      ConstantTypes.CAN_HOIST
    )
  )
  const { children } = branch
  const firstChild = children[0]
  // 是不是需要用 fragment 将所有 children 包起来
  const needFragmentWrapper =
    children.length !== 1 || firstChild.type !== NodeTypes.ELEMENT
  if (needFragmentWrapper) {
    if (children.length === 1 && firstChild.type === NodeTypes.FOR) {
      // optimize away nested fragments when child is a ForNode
      const vnodeCall = firstChild.codegenNode!
      injectProp(vnodeCall, keyProperty, context)
      return vnodeCall
    } else {
      return createVNodeCall(
        context,
        helper(FRAGMENT),
        createObjectExpression([keyProperty]),
        children,
        PatchFlags.STABLE_FRAGMENT +
          (__DEV__
            ? ` /* ${PatchFlagNames[PatchFlags.STABLE_FRAGMENT]} */`
            : ``),
        undefined,
        undefined,
        true,
        false,
        branch.loc
      )
    }
  } else {
    // children.length === 1 && firstChild.type === NodeTypes.ELEMENT
    // 正常的元素，直接用它来创建
    const vnodeCall = (firstChild as ElementNode)
      .codegenNode as BlockCodegenNode
    // Change createVNode to createBlock.
    if (vnodeCall.type === NodeTypes.VNODE_CALL) {
      vnodeCall.isBlock = true
      helper(OPEN_BLOCK)
      helper(CREATE_BLOCK)
    }

    // inject branch key
    injectProp(vnodeCall, keyProperty, context)
    return vnodeCall
  }
}

function isSameKey(
  a: AttributeNode | DirectiveNode | undefined,
  b: AttributeNode | DirectiveNode
): boolean {
  if (!a || a.type !== b.type) {
    return false
  }
  if (a.type === NodeTypes.ATTRIBUTE) {
    if (a.value!.content !== (b as AttributeNode).value!.content) {
      return false
    }
  } else {
    // directive
    const exp = a.exp!
    const branchExp = (b as DirectiveNode).exp!
    if (exp.type !== branchExp.type) {
      return false
    }
    if (
      exp.type !== NodeTypes.SIMPLE_EXPRESSION ||
      (exp.isStatic !== (branchExp as SimpleExpressionNode).isStatic ||
        exp.content !== (branchExp as SimpleExpressionNode).content)
    ) {
      return false
    }
  }
  return true
}

function getParentCondition(
  node: IfConditionalExpression | CacheExpression
): IfConditionalExpression {
  while (true) {
    if (node.type === NodeTypes.JS_CONDITIONAL_EXPRESSION) {
      if (node.alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION) {
        node = node.alternate
      } else {
        return node
      }
    } else if (node.type === NodeTypes.JS_CACHE_EXPRESSION) {
      node = node.value as IfConditionalExpression
    }
  }
}
