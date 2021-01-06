import {
  createCallExpression,
  createForLoopParams,
  createFunctionExpression,
  createStructuralDirectiveTransform,
  ForNode,
  NodeTypes,
  processFor
} from '@vue/compiler-dom'
import { SSR_RENDER_LIST } from '../runtimeHelpers'
import {
  processChildrenAsStatement,
  SSRTransformContext
} from '../ssrCodegenTransform'

// 同 v-if 先交个 core:transformFor 处理先
export const ssrTransformFor = createStructuralDirectiveTransform(
  'for',
  processFor
)

export function ssrProcessFor(
  node: ForNode,
  context: SSRTransformContext,
  disableNestedFragments = false
) {
  // 需要 Fragment 的条件
  // 1. disableNestedFragments = false
  // 2. 有两个及以上的孩子节点或者第一个孩子节点的类型不是 ELEMENT（可能是用户组件）
  const needFragmentWrapper =
    !disableNestedFragments &&
    (node.children.length !== 1 || node.children[0].type !== NodeTypes.ELEMENT)

  // 创建 for (...) 表达式
  const renderLoop = createFunctionExpression(
    createForLoopParams(node.parseResult)
  )

  renderLoop.body = processChildrenAsStatement(
    node.children,
    context,
    needFragmentWrapper
  )

  // v-for always renders a fragment unless explicitly disabled
  if (!disableNestedFragments) {
    context.pushStringPart(`<!--[-->`)
  }

  // 创建表达式
  context.pushStatement(
    createCallExpression(context.helper(SSR_RENDER_LIST), [
      node.source,
      renderLoop
    ])
  )

  if (!disableNestedFragments) {
    context.pushStringPart(`<!--]-->`)
  }
}
