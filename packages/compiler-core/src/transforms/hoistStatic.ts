import { PatchFlags } from '@vue/shared'
import {
  ComponentNode,
  ElementTypes,
  NodeTypes,
  ParentNode,
  PlainElementNode,
  RootNode,
  SimpleExpressionNode,
  TemplateChildNode,
  TemplateNode,
  VNodeCall
} from '../ast'
import { TransformContext } from '../transform'
import { isSlotOutlet } from '../utils'

export function hoistStatic(root: RootNode, context: TransformContext) {
  walk(
    root,
    context,
    new Map(),
    // 只有一个孩子且为 ELEMENT的根元素节点，不做提升
    isSingleElementRoot(root, root.children[0])
  )
}

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

function walk(
  node: ParentNode,
  context: TransformContext,
  resultCache: Map<TemplateChildNode, StaticType>,
  doNotHoistNode: boolean = false
) {
  let hasHoistedNode = false
  // Some transforms, e.g. transformAssetUrls from @vue/compiler-sfc, replaces
  // static bindings with expressions. These expressions are guaranteed to be
  // constant so they are still eligible for hoisting, but they are only
  // available at runtime and therefore cannot be evaluated ahead of time.
  // This is only a concern for pre-stringification (via transformHoist by
  // @vue/compiler-dom), but doing it here allows us to perform only one full
  // walk of the AST and allow `stringifyStatic` to stop walking as soon as its
  // stringficiation threshold is met.
  let hasRuntimeConstant = false

  const { children } = node

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    // only plain elements & text calls are eligible for hoisting.
    if (
      child.type === NodeTypes.ELEMENT &&
      child.tagType === ElementTypes.ELEMENT
    ) {
      let staticType
      if (
        !doNotHoistNode &&
        (staticType = getStaticType(child, resultCache)) > 0
      ) {
        if (staticType === StaticType.HAS_RUNTIME_CONSTANT) {
          // 运行时常量？
          hasRuntimeConstant = true
        }

        // 整棵树都是静态的
        ;(child.codegenNode as VNodeCall).patchFlag =
          PatchFlags.HOISTED + (__DEV__ ? ` /* HOISTED */` : ``)

        child.codegenNode = context.hoist(child.codegenNode!)
        hasHoistedNode = true
        continue
      } else {
        // 节点可能包含动态孩子节点，但是有可提升的属性
        // TODO prop hoist
      }
    } else if (child.type === NodeTypes.TEXT_CALL) {
      // 纯文本节点
      const staticType = getStaticType(child.content, resultCache)
      if (staticType > 0) {
        hasRuntimeConstant = true
      }
      child.codegenNode = context.hoist(child.codegenNode)
      hasHoistedNode = true
    }

    // 递归
    if (child.type === NodeTypes.ELEMENT) {
      walk(child, context, resultCache)
    } else if (child.type === NodeTypes.FOR) {
      walk(child, context, resultCache, child.children.length === 1)
    } else if (child.type === NodeTypes.IF) {
      for (let i = 0; i < child.branches.length; i++) {
        // v-if 只有单个孩子节点的时候不做提升
        walk(
          child.branches[i],
          context,
          resultCache,
          child.branches[i].children.length === 1
        )
      }
    }
  }

  if (!hasRuntimeConstant && hasHoistedNode && context.transformHoist) {
    context.transformHoist(children, context, node)
  }
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
