import {
  ComponentNode,
  createCallExpression,
  createFunctionExpression,
  createSimpleExpression,
  ExpressionNode,
  findProp,
  NodeTypes
} from '@vue/compiler-dom'
import { createSSRCompilerError, SSRErrorCodes } from '../error'
import { SSR_RENDER_TELEPORT } from '../runtimeHelpers'
import {
  processChildrenAsStatement,
  SSRTransformContext
} from '../ssrCodegenTransform'

// 这是个第二阶段的 codegen transform
export function ssrProcessTeleport(
  node: ComponentNode,
  context: SSRTransformContext
) {
  const targetProp = findProp(node, 'to')
  if (!targetProp) {
    context.onError(
      createSSRCompilerError(SSRErrorCodes.X_SSR_NO_TELEPORT_TARGET)
    )
    return
  }

  let target: ExpressionNode | undefined
  if (targetProp.type === NodeTypes.ATTRIBUTE) {
    target =
      targetProp.value && createSimpleExpression(targetProp.value.content, true)
  } else {
    target = targetProp.exp
  }

  if (!target) {
    context.onError(
      createSSRCompilerError(
        SSRErrorCodes.X_SSR_NO_TELEPORT_TARGET,
        targetProp.loc
      )
    )
    return
  }

  const disabledProp = findProp(node, 'disabled', false, true /* allow empty */)
  // <teleport disabled> -> true
  // <teleport :disabled="foo"> -> foo || 'false'
  // <teleport> -> 'false'
  const disabled = disabledProp
    ? disabledProp.type === NodeTypes.ATTRIBUTE
      ? `true`
      : disabledProp.exp || `false`
    : 'false'

  const contentRenderFn = createFunctionExpression(
    [`_push`],
    undefined, // body is added later
    true, // newline
    false, // isSlot
    node.loc
  )

  contentRenderFn.body = processChildrenAsStatement(node.children, context)
  context.pushStatement(
    createCallExpression(context.helper(SSR_RENDER_TELEPORT), [
      `_push`,
      contentRenderFn,
      target,
      disabled,
      `_parent`
    ])
  )
}
