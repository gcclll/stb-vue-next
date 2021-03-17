import { RendererInternals } from './renderer'
import { VNode } from './vnode'

export type RootHydrateFunction = (
  vnode: VNode<Node, Element>,
  container: Element
) => void

const enum DOMNodeTypes {
  ELEMENT = 1,
  TEXT = 3,
  COMMENT = 8
}

// Note: hydration is DOM-specific
// But we have to place it in core due to tight coupling with core - splitting
// it out creates a ton of unnecessary complexity.
// Hydration also depends on some renderer internal logic which needs to be
// passed in via arguments.
export function createHydrationFunctions(
  rendererInternals: RendererInternals<Node, Element>
) {
  // TODO
  return [null, null] as const
}
