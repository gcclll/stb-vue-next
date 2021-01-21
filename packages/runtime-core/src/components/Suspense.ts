import { isArray, isFunction, ShapeFlags } from '@vue/shared'
import { ComponentInternalInstance } from '../component'
import { filterSingleRoot } from '../componentRenderUtils'
import { Slots } from '../componentSlots'
import {
  MoveType,
  RendererElement,
  RendererNode,
  SetupRenderEffectFn
} from '../renderer'
import { queuePostFlushCb } from '../scheduler'
import { normalizeVNode, VNode, VNodeChild, VNodeProps } from '../vnode'
import { warn } from '../warning'

export interface SuspenseProps {
  onResolve?: () => void
  onPending?: () => void
  onFallback?: () => void
  timeout?: string | number
}

export const isSuspense = (type: any): boolean => type.__isSuspense

// Suspense exposes a component-like API, and is treated like a component
// in the compiler, but internally it's a special built-in type that hooks
// directly into the renderer.
export const SuspenseImpl = {
  // TODO
}

// Force-casted public typing for h and TSX props inference
export const Suspense = ((__FEATURE_SUSPENSE__
  ? SuspenseImpl
  : null) as any) as {
  __isSuspense: true
  new (): { $props: VNodeProps & SuspenseProps }
}

export interface SuspenseBoundary {
  vnode: VNode<RendererNode, RendererElement, SuspenseProps>
  parent: SuspenseBoundary | null
  parentComponent: ComponentInternalInstance | null
  isSVG: boolean
  container: RendererElement
  hiddenContainer: RendererElement
  anchor: RendererNode | null
  activeBranch: VNode | null
  pendingBranch: VNode | null
  deps: number
  pendingId: number
  timeout: number
  isInFallback: boolean
  isHydrating: boolean
  isUnmounted: boolean
  effects: Function[]
  resolve(force?: boolean): void
  fallback(fallbackVNode: VNode): void
  move(
    container: RendererElement,
    anchor: RendererNode | null,
    type: MoveType
  ): void
  next(): RendererNode | null
  registerDep(
    instance: ComponentInternalInstance,
    setupRenderEffect: SetupRenderEffectFn
  ): void
  unmount(parentSuspense: SuspenseBoundary | null, doRemove?: boolean): void
}

export function normalizeSuspenseChildren(
  vnode: VNode
): {
  content: VNode
  fallback: VNode
} {
  const { shapeFlag, children } = vnode
  let content: VNode, fallback: VNode

  if (shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    content = normalizeSuspenseSlot((children as Slots).default)
    fallback = normalizeSuspenseSlot((children as Slots).fallback)
  } else {
    content = normalizeSuspenseSlot(children as VNodeChild)
    fallback = normalizeVNode(null)
  }

  return {
    content,
    fallback
  }
}

function normalizeSuspenseSlot(s: any) {
  if (isFunction(s)) {
    s = s()
  }
  if (isArray(s)) {
    // ROOT 必须是单节点 <div>...</div>
    const singleChild = filterSingleRoot(s)
    if (__DEV__ && !singleChild) {
      warn(`<Suspense> slots expect a single root node.`)
    }
    s = singleChild
  }
  return normalizeVNode(s)
}

export function queueEffectWithSuspense(
  fn: Function | Function[],
  suspense: SuspenseBoundary | null
): void {
  if (suspense && suspense.pendingBranch) {
    if (isArray(fn)) {
      suspense.effects.push(...fn)
    } else {
      suspense.effects.push(fn)
    }
  } else {
    queuePostFlushCb(fn)
  }
}
