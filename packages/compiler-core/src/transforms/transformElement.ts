import {
  ObjectExpression,
  CallExpression,
  ExpressionNode,
  NodeTypes,
  ElementTypes,
  ComponentNode,
  createSimpleExpression,
  createCallExpression
} from '../ast'
import { findProp, findDir, isCoreComponent, toValidAssetId } from '../utils'
import { NodeTransform, TransformContext } from '../transform'
import { RESOLVE_COMPONENT, RESOLVE_DYNAMIC_COMPONENT } from '../runtimeHelpers'

export type PropsExpression = ObjectExpression | CallExpression | ExpressionNode

export const transformElement: NodeTransform = (node, context) => {
  if (
    !(
      node.type === NodeTypes.ELEMENT &&
      (node.tagType === ElementTypes.ELEMENT ||
        node.tagType === ElementTypes.COMPONENT)
    )
  ) {
    return
  }

  // perform the work on exit, after all child expressions have been
  // processed and merged.
  return function postTransformElement() {}
}

export function resolveComponentType(
  node: ComponentNode,
  context: TransformContext,
  ssr = false
) {
  const { tag } = node

  // 1. 动态组件
  const isProp =
    node.tag === 'component' ? findProp(node, 'is') : findDir(node, 'is')

  if (isProp) {
    const exp =
      // 静态属性
      isProp.type === NodeTypes.ATTRIBUTE
        ? isProp.value && createSimpleExpression(isProp.value.content, true)
        : isProp.exp

    if (exp) {
      return createCallExpression(context.helper(RESOLVE_DYNAMIC_COMPONENT), [
        exp
      ])
    }
  }

  // 2. 内置组件(Teleport, Transition, KeepAlive, Suspense)
  const builtIn = isCoreComponent(tag) || context.isBuiltInComponent(tag)
  if (builtIn) {
    // built-ins are simply fallthroughs / have special handling during ssr
    // no we don't need to import their runtime equivalents
    if (!ssr) context.helper(builtIn)
    return builtIn
  }

  // 3. 用户自定义组件(setup 期间绑定的)，缓存到 $setup 对象上
  if (context.bindingMetadata[tag] === 'setup') {
    return `$setup[${JSON.stringify(tag)}]`
  }

  // 4. 用户组件(resolve)
  context.helper(RESOLVE_COMPONENT)
  context.components.add(tag)
  return toValidAssetId(tag, `component`)
}
