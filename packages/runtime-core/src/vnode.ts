import { Component, ComponentInternalInstance } from './component'
import { TeleportImpl } from './components/Teleport'
import { SuspenseBoundary, SuspenseImpl } from './components/Suspense'
import { ReactiveFlags, Ref } from '@vue/reactivity'
import { RawSlots } from './componentSlots'
import { RendererNode, RendererElement } from './renderer'
import { DirectiveBinding } from './directives'
import { TransitionHooks } from './components/BaseTransition'
import { AppContext } from './apiCreateApp'

export const Fragment = (Symbol(__DEV__ ? 'Fragment' : undefined) as any) as {
  __isFragment: true
  new (): {
    $props: VNodeProps
  }
}
export const Text = Symbol(__DEV__ ? 'Text' : undefined)
export const Comment = Symbol(__DEV__ ? 'Comment' : undefined)
export const Static = Symbol(__DEV__ ? 'Static' : undefined)

export type VNodeTypes =
  | string
  | VNode
  | Component
  | typeof Text
  | typeof Static
  | typeof Comment
  | typeof Fragment
  | typeof TeleportImpl
  | typeof SuspenseImpl

export type VNodeRef =
  | string
  | Ref
  | ((ref: object | null, refs: Record<string, any>) => void)

export type VNodeNormalizedRefAtom = {
  i: ComponentInternalInstance
  r: VNodeRef
}

export type VNodeNormalizedRef =
  | VNodeNormalizedRefAtom
  | (VNodeNormalizedRefAtom)[]

type VNodeMountHook = (vnode: VNode) => void
type VNodeUpdateHook = (vnode: VNode, oldVNode: VNode) => void
export type VNodeHook =
  | VNodeMountHook
  | VNodeUpdateHook
  | VNodeMountHook[]
  | VNodeUpdateHook[]

// https://github.com/microsoft/TypeScript/issues/33099
export type VNodeProps = {
  key?: string | number
  ref?: VNodeRef

  // vnode hooks
  onVnodeBeforeMount?: VNodeMountHook | VNodeMountHook[]
  onVnodeMounted?: VNodeMountHook | VNodeMountHook[]
  onVnodeBeforeUpdate?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeUpdated?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeBeforeUnmount?: VNodeMountHook | VNodeMountHook[]
  onVnodeUnmounted?: VNodeMountHook | VNodeMountHook[]
}

type VNodeChildAtom =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | void

export type VNodeArrayChildren = Array<VNodeArrayChildren | VNodeChildAtom>

export type VNodeChild = VNodeChildAtom | VNodeArrayChildren

export type VNodeNormalizedChildren =
  | string
  | VNodeArrayChildren
  | RawSlots
  | null

export interface VNode<
  HostNode = RendererNode,
  HostElement = RendererElement,
  ExtraProps = { [key: string]: any }
> {
  /**
   * @internal
   */
  __v_isVNode: true
  /**
   * @internal
   */
  [ReactiveFlags.SKIP]: true
  type: VNodeTypes
  props: (VNodeProps & ExtraProps) | null
  key: string | number | null
  ref: VNodeNormalizedRef | null
  scopeId: string | null // SFC only
  children: VNodeNormalizedChildren
  component: ComponentInternalInstance | null
  dirs: DirectiveBinding[] | null
  transition: TransitionHooks<HostElement> | null

  // DOM
  el: HostNode | null
  anchor: HostNode | null // fragment anchor
  target: HostElement | null // teleport target
  targetAnchor: HostNode | null // teleport target anchor
  staticCount: number // number of elements contained in a static vnode

  // suspense
  suspense: SuspenseBoundary | null
  ssContent: VNode | null
  ssFallback: VNode | null

  // optimization only
  shapeFlag: number
  patchFlag: number
  dynamicProps: string[] | null
  dynamicChildren: VNode[] | null

  // application root node only
  appContext: AppContext | null
}
