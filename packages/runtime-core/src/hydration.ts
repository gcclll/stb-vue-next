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
