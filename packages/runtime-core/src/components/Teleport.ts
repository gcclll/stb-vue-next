import { RendererElement, RendererNode } from '../renderer'
import { VNode } from '../vnode'

export type TeleportVNode = VNode<RendererNode, RendererElement, TeleportProps>

export interface TeleportProps {
  to: string | RendererElement | null | undefined
  disabled?: boolean
}

export const TeleportImpl = {
  // TODO
}

export const enum TeleportMoveTypes {
  TARGET_CHANGE,
  TOGGLE, // enable / disable
  REORDER // moved in the main view
}

interface TeleportTargetElement extends Element {
  // last teleport target
  _lpa?: Node | null
}
