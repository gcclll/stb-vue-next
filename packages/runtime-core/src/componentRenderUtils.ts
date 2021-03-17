import { ComponentInternalInstance } from './component'
import {
  VNode,
  normalizeVNode,
  createVNode,
  Comment,
  cloneVNode,
  VNodeArrayChildren,
  isVNode
} from './vnode'

import { PatchFlags, ShapeFlags, isOn, isModelListener } from '@vue/shared'
import { handleError, ErrorCodes } from './errorHandling'
import { warn } from './warning'
import { Comment, isVNode, VNode, VNodeArrayChildren } from './vnode'

/**
 * mark the current rendering instance for asset resolution (e.g.
 * resolveComponent, resolveDirective) during render
 */
export let currentRenderingInstance: ComponentInternalInstance | null = null

export function setCurrentRenderingInstance(
  instance: ComponentInternalInstance | null
) {
  currentRenderingInstance = instance
}

/**
 * dev only flag to track whether $attrs was used during render.
 * If $attrs was used during render then the warning for failed attrs
 * fallthrough can be suppressed.
 * 开发是用的标识，用来跟踪 $attrs 静态属性在 render 期间是否被使用
 * 如果被使用了，或许就不需要给出警告？啥意思???
 */
let accessedAttrs: boolean = false

export function markAttrsAccessed() {
  accessedAttrs = true
}

export function renderComponentRoot(
  instance: ComponentInternalInstance
): VNode {
  const {
    // type: Component,
    vnode,
    proxy,
    withProxy,
    props,
    // propsOptions: [propsOptions],
    // slots,
    attrs,
    // emit,
    render,
    renderCache,
    data,
    setupState,
    ctx
  } = instance

  let result

  currentRenderingInstance = instance

  if (__DEV__) {
    accessedAttrs = false
  }

  try {
    let fallthroughAttrs
    if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
      // withProxy is a proxy with a different `has` trap only for
      // runtime-compiled render functions using `with` block.
      const proxyToUse = withProxy || proxy
      console.log('normalize vnode')
      result = normalizeVNode(
        render!.call(
          proxyToUse,
          proxyToUse!,
          renderCache,
          props,
          setupState,
          data,
          ctx
        )
      )
      fallthroughAttrs = attrs
    } else {
      // TODO 无状态组件？
      result = {} as any
    }

    // TODO attr merging
    let root = result
    let setRoot: ((root: VNode) => void) | undefined = undefined
    if (__DEV__ && result.patchFlag & PatchFlags.DEV_ROOT_FRAGMENT) {
      ;[root, setRoot] = getChildRoot(result)
    }
    // TODO dirs, transition

    if (__DEV__ && setRoot) {
      setRoot(root)
    } else {
      result = root
    }
  } catch (err) {
    handleError(err, instance, ErrorCodes.RENDER_FUNCTION)
    result = createVNode(Comment)
  }
  currentRenderingInstance = null

  return result
}

/**
 * dev only
 * In dev mode, template root level comments are rendered, which turns the
 * template into a fragment root, but we need to locate the single element
 * root for attrs and scope id processing.
 */
const getChildRoot = (
  vnode: VNode
): [VNode, ((root: VNode) => void) | undefined] => {
  const rawChildren = vnode.children as VNodeArrayChildren
  const dynamicChildren = vnode.dynamicChildren
  const childRoot = filterSingleRoot(rawChildren)
  if (!childRoot) {
    return [vnode, undefined]
  }
  const index = rawChildren.indexOf(childRoot)
  const dynamicIndex = dynamicChildren ? dynamicChildren.indexOf(childRoot) : -1
  const setRoot = (updatedRoot: VNode) => {
    rawChildren[index] = updatedRoot
    if (dynamicChildren) {
      if (dynamicIndex > -1) {
        dynamicChildren[dynamicIndex] = updatedRoot
      } else if (updatedRoot.patchFlag > 0) {
        vnode.dynamicChildren = [...dynamicChildren, updatedRoot]
      }
    }
  }
  return [normalizeVNode(childRoot), setRoot]
}

export function filterSingleRoot(
  children: VNodeArrayChildren
): VNode | undefined {
  let singleRoot
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (isVNode(child)) {
      // ignore user comment
      if (child.type !== Comment || child.children === 'v-if') {
        if (singleRoot) {
          // has more than 1 non-comment child, return now

          return
        } else {
          singleRoot = child
        }
      }
    } else {
      return
    }
  }
  return singleRoot
}
