import {
  createSimpleExpression,
  DirectiveNode,
  ElementNode,
  ElementTypes,
  IfBranchNode,
  IfNode,
  NodeTypes,
  SimpleExpressionNode
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import {
  createStructuralDirectiveTransform,
  TransformContext
} from '../transform'
import { findDir, findProp } from '../utils'
import { validateBrowserExpression } from '../validateExpression'

export const transformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  (node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
      // TODO
      console.log(ifNode, branch, isRoot)
      return () => {}
    })
  }
)

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
    // TODO
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
    // TODO
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
