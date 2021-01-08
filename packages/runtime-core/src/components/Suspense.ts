import { ComponentInternalInstance } from '../component'
import {
  MoveType,
  RendererElement,
  RendererNode,
  SetupRenderEffectFn
} from '../renderer'
import { VNode, VNodeProps } from '../vnode'

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
