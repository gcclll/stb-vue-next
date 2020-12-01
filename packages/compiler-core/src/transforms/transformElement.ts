import {
  ObjectExpression,
  CallExpression,
  ExpressionNode,
  NodeTypes,
  ElementTypes,
  ComponentNode,
  createSimpleExpression,
  createCallExpression,
  VNodeCall,
  TemplateTextChildNode,
  createVNodeCall
} from '../ast'
import { isObject, PatchFlagNames, PatchFlags } from '@vue/shared'
import { findProp, findDir, isCoreComponent, toValidAssetId } from '../utils'
import { NodeTransform, TransformContext } from '../transform'
import {
  KEEP_ALIVE,
  RESOLVE_COMPONENT,
  RESOLVE_DYNAMIC_COMPONENT,
  SUSPENSE,
  TELEPORT
} from '../runtimeHelpers'
import { getStaticType } from './hoistStatic'

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
  return function postTransformElement() {
    const { tag, props } = node
    const isComponent = node.tagType === ElementTypes.COMPONENT

    // The goal of the transform is to create a codegenNode implementing the
    // VNodeCall interface.
    const vnodeTag = isComponent
      ? resolveComponentType(node as ComponentNode, context)
      : `"${tag}"`
    const isDynamicComponent =
      isObject(vnodeTag) && vnodeTag.callee === RESOLVE_DYNAMIC_COMPONENT

    let vnodeProps: VNodeCall['props']
    let vnodeChildren: VNodeCall['children']
    let vnodePatchFlag: VNodeCall['patchFlag']
    let patchFlag: number = 0
    let vnodeDynamicProps: VNodeCall['dynamicProps']
    let dynamicPropNames: string[] | undefined
    let vnodeDirectives: VNodeCall['directives']

    let shouldUseBlock =
      // dynamic component may resolve to plain elements
      isDynamicComponent ||
      vnodeTag === TELEPORT ||
      vnodeTag === SUSPENSE ||
      (!isComponent &&
        // <svg> and <foreignObject> must be forced into blocks so that block
        // updates inside get proper isSVG flag at runtime. (#639, #643)
        // This is technically web-specific, but splitting the logic out of core
        // leads to too much unnecessary complexity.
        (tag === 'svg' ||
          tag === 'foreignObject' ||
          // #938: elements with dynamic keys should be forced into blocks
          findProp(node, 'key', true)))

    if (props.length > 0) {
      // TODO props
    }

    if (node.children.length > 0) {
      if (vnodeTag === KEEP_ALIVE) {
        // TODO KeepAlive
      }

      const shouldBuildAsSlots =
        isComponent &&
        // Teleport is not a real component and has dedicated runtime handling
        vnodeTag !== TELEPORT &&
        vnodeTag !== KEEP_ALIVE

      if (shouldBuildAsSlots) {
        // TODO
      } else if (node.children.length === 1 && vnodeTag !== TELEPORT) {
        // 只有一个孩子节点的时候
        const child = node.children[0]
        const type = child.type
        // 动态文本节点检测, 插值或组合表达式
        const hasDynamicTextChild =
          type === NodeTypes.INTERPOLATION ||
          type === NodeTypes.COMPOUND_EXPRESSION

        if (hasDynamicTextChild && !getStaticType(child)) {
          patchFlag |= PatchFlags.TEXT
        }

        // 唯一的 child 是个文本节点(plain / interpolation / expression)
        if (hasDynamicTextChild || type === NodeTypes.TEXT) {
          vnodeChildren = child as TemplateTextChildNode
        } else {
          vnodeChildren = node.children
        }
      } else {
        vnodeChildren = node.children
      }
    }

    // patchFlag 处理
    if (patchFlag !== 0) {
      if (__DEV__) {
        if (patchFlag < 0) {
          // special flags (negative and mutually exclusive)
          vnodePatchFlag = patchFlag + ` /* ${PatchFlagNames[patchFlag]} */`
        } else {
          const flagNames = Object.keys(PatchFlagNames)
            .map(Number)
            .filter(n => n > 0 && patchFlag & n)
            .map(n => PatchFlagNames[n])
            .join(', ')

          vnodePatchFlag = patchFlag + ` /* ${flagNames} */`
        }
      } else {
        vnodePatchFlag = String(patchFlag)
      }

      // 动态属性
      if (dynamicPropNames && dynamicPropNames.length) {
        vnodeDynamicProps = stringifyDynamicPropNames(dynamicPropNames)
      }
    }

    // 开始构造 VNODE_CALL 类型 codegenNode
    node.codegenNode = createVNodeCall(
      context,
      vnodeTag,
      vnodeProps,
      vnodeChildren,
      vnodePatchFlag,
      vnodeDynamicProps,
      vnodeDirectives,
      !!shouldUseBlock,
      false /* disableTracking */,
      node.loc
    )
  }
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

function stringifyDynamicPropNames(props: string[]): string {
  let propsNamesString = `[`
  for (let i = 0, l = props.length; i < l; i++) {
    propsNamesString += JSON.stringify(props[i])
    if (i < l - 1) propsNamesString += ','
  }
  return propsNamesString + `]`
}
