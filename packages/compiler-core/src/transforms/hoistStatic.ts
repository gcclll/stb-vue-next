import { getPackedSettings } from 'http2'
import {
  ComponentNode,
  ElementTypes,
  NodeTypes,
  PlainElementNode,
  RootNode,
  SimpleExpressionNode,
  TemplateChildNode,
  TemplateNode,
  VNodeCall
} from '../ast'
import { TransformContext } from '../transform'
import { isSlotOutlet } from '../utils'

export function hoistStatic(root: RootNode, context: TransformContext) {}

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

const enum StaticType {
  NOT_STATIC = 0,
  FULL_STATIC,
  HAS_RUNTIME_CONSTANT
}

export function getStaticType(
  node: TemplateChildNode | SimpleExpressionNode,
  resultCache: Map<TemplateChildNode, StaticType> = new Map()
): StaticType {
  switch (node.type) {
    case NodeTypes.ELEMENT:
      if (node.tagType !== ElementTypes.ELEMENT) {
        return StaticType.NOT_STATIC
      }

      const cached = resultCache.get(node)
      if (cached !== undefined) {
        return cached
      }

      const codegenNode = node.codegenNode!
      if (codegenNode.type !== NodeTypes.VNODE_CALL) {
        return StaticType.NOT_STATIC
      }

    // TODO more
    // const flag = getPatchFlag(codegenNode)
    case NodeTypes.COMMENT:
    case NodeTypes.TEXT:
      return StaticType.FULL_STATIC
    case NodeTypes.INTERPOLATION:
      return getStaticType(node.content, resultCache)
    case NodeTypes.SIMPLE_EXPRESSION:
      return node.isConstant
        ? node.isRuntimeConstant
          ? StaticType.HAS_RUNTIME_CONSTANT
          : StaticType.FULL_STATIC
        : StaticType.NOT_STATIC
    default:
      if (__DEV__) {
        const exhaustiveCheck: never = node
        exhaustiveCheck
      }
      return StaticType.NOT_STATIC
  }
}

function getPatchFlag(node: VNodeCall): number | undefined {
  const flag = node.patchFlag
  return flag ? parseInt(flag, 10) : undefined
}
