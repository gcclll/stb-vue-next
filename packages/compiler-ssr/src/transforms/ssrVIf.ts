import {
  BlockStatement,
  createBlockStatement,
  createCallExpression,
  createIfStatement,
  createStructuralDirectiveTransform,
  IfBranchNode,
  IfNode,
  NodeTypes,
  processIf
} from '@vue/compiler-dom'
import {
  processChildrenAsStatement,
  SSRTransformContext
} from '../ssrCodegenTransform'

// Plugin for the first transform pass, which simply constructs the AST node
// 先经过 core: transformIf 处理一道
export const ssrTransformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  processIf
)

export function ssrProcessIf(
  node: IfNode,
  context: SSRTransformContext,
  disableNestedFragments = false
) {
  const [rootBranch] = node.branches
  const ifStatement = createIfStatement(
    rootBranch.condition!,
    processIfBranch(rootBranch, context, disableNestedFragments)
  )
  context.pushStatement(ifStatement)

  // 到这里说明应该经过 core：transformIf 处理过了
  // 所以这里 node.branches 就应该包好 if/else 分支 AST
  let currentIf = ifStatement
  for (let i = 1; i < node.branches.length; i++) {
    const branch = node.branches[i]
    const branchBlockStatement = processIfBranch(
      branch,
      context,
      disableNestedFragments
    )

    if (branch.condition) {
      // else-if
      currentIf = currentIf.alternate = createIfStatement(
        branch.condition,
        branchBlockStatement
      )
    } else {
      // else
      currentIf.alternate = branchBlockStatement
    }
  }

  // 最后一个了，需要填充一个结果
  if (!currentIf.alternate) {
    currentIf.alternate = createBlockStatement([
      createCallExpression(`_push`, ['`<!---->`'])
    ])
  }
}

function processIfBranch(
  branch: IfBranchNode,
  context: SSRTransformContext,
  disableNestedFragments = false
): BlockStatement {
  const { children } = branch
  const needFragmentWrapper =
    !disableNestedFragments &&
    (children.length !== 1 || children[0].type !== NodeTypes.ELEMENT) &&
    // optimize away nested fragments when the only child is a ForNode
    !(children.length === 1 && children[0].type === NodeTypes.FOR)

  return processChildrenAsStatement(children, context, needFragmentWrapper)
}
