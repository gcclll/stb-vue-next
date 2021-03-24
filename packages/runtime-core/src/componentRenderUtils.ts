import { ComponentInternalInstance, Data } from './component'
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
import { isEmitListener } from './componentEmits'

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

// 检查组件是否应该更新
export function shouldUpdateComponent(
  prevVNode: VNode,
  nextVNode: VNode,
  optimized?: boolean
): boolean {
  console.log('should update component')
  const { props: prevProps, children: prevChildren, component } = prevVNode
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode
  const emits = component!.emitsOptions

  // 运行时 vnode 上的指令或者 transition 动画，强制 child 更新
  if (nextVNode.dirs || nextVNode.transition) {
    return true
  }

  if (optimized && patchFlag >= 0) {
    if (patchFlag & PatchFlags.DYNAMIC_SLOTS) {
      // 插槽内容引用的值可能发生了改变，比如： v-for 中
      return true
    }
    if (patchFlag & PatchFlags.FULL_PROPS) {
      if (!prevProps) {
        return !!nextProps
      }

      return hasPropsChanged(prevProps, nextProps!, emits)
    } else if (patchFlag & PatchFlags.PROPS) {
      const dynamicProps = nextVNode.dynamicProps!
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i]
        // 只要有一个属性名不一样，就需要更新
        if (
          nextProps![key] !== prevProps![key] &&
          !isEmitListener(emits, key)
        ) {
          return true
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !(nextChildren as any).$stable) {
        return true
      }
    }

    if (prevProps === nextProps) {
      return false
    }

    if (!prevProps) {
      return !!nextProps
    }

    if (!nextProps) {
      return true
    }

    return hasPropsChanged(prevProps, nextProps, emits)
  }

  return false
}

function hasPropsChanged(
  prevProps: Data,
  nextProps: Data,
  emitsOptions: ComponentInternalInstance['emitsOptions']
): boolean {
  console.log('has changed props')
  const nextKeys = Object.keys(nextProps)
  // 包含属性数不一样，可能删除、添加了
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i]
    // 值不同，且不是事件属性
    if (
      nextProps[key] !== prevProps[key] &&
      !isEmitListener(emitsOptions, key)
    ) {
      return true
    }
  }
  return false
}

export function updateHOCHostEl(
  { vnode, parent }: ComponentInternalInstance,
  el: typeof vnode.el // HostNode
) {
  while (parent && parent.subTree === vnode) {
    ;(vnode = parent.vnode).el = el
    parent = parent.parent
  }
}
