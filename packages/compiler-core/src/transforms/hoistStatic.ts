import {
  ComponentNode,
  NodeTypes,
  PlainElementNode,
  RootNode,
  TemplateChildNode,
  TemplateNode
} from '../ast'
import { isSlotOutlet } from '../utils'

export function isSingleElementRoot(
  root: RootNode,
  child: TemplateChildNode
): child is PlainElementNode | ComponentNode | TemplateNode {
  const { children } = root
  return (
    children.length === 1 &&
    child.type === NodeTypes.ELEMENT &&
    !isSlotOutlet(child)
  )
}
