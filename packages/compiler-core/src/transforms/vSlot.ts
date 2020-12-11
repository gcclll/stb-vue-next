import { SlotFlags, slotFlagsText } from '@vue/shared'
import {
  CallExpression,
  ConditionalExpression,
  createConditionalExpression,
  createFunctionExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  DirectiveNode,
  ElementNode,
  ElementTypes,
  ExpressionNode,
  FunctionExpression,
  NodeTypes,
  Property,
  SlotsExpression,
  SourceLocation,
  TemplateChildNode
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { WITH_CTX } from '../runtimeHelpers'
import { NodeTransform, TransformContext } from '../transform'
import { findDir, hasScopeRef, isStaticExp, isTemplateNode } from '../utils'
// A NodeTransform that:
// 1. Tracks scope identifiers for scoped slots so that they don't get prefixed
//    by transformExpression. This is only applied in non-browser builds with
//    { prefixIdentifiers: true }.
// 2. Track v-slot depths so that we know a slot is inside another slot.
//    Note the exit callback is executed before buildSlots() on the same node,
//    so only nested slots see positive numbers.
export const trackSlotScopes: NodeTransform = (node, context) => {
  // <component> or <template>
  if (
    node.type === NodeTypes.ELEMENT &&
    (node.tagType === ElementTypes.COMPONENT ||
      node.tagType === ElementTypes.TEMPLATE)
  ) {
    // We are only checking non-empty v-slot here
    // since we only care about slots that introduce scope variables.
    const vSlot = findDir(node, 'slot')
    if (vSlot) {
      const slotProps = vSlot.exp
      if (!__BROWSER__ && context.prefixIdentifiers) {
        slotProps && context.addIdentifiers(slotProps)
      }

      context.scopes.vSlot++
      return () => {
        if (!__BROWSER__ && context.prefixIdentifiers) {
          slotProps && context.removeIdentifiers(slotProps)
        }
        context.scopes.vSlot--
      }
    }
  }
}

export type SlotFnBuilder = (
  slotProps: ExpressionNode | undefined,
  slotChildren: TemplateChildNode[],
  loc: SourceLocation
) => FunctionExpression

const buildClientSlotFn: SlotFnBuilder = (props, children, loc) =>
  createFunctionExpression(
    props,
    children,
    false /* newline */,
    true /* isSlot */,
    children.length ? children[0].loc : loc
  )

// Instead of being a DirectiveTransform, v-slot processing is called during
// transformElement to build the slots object for a component.
export function buildSlots(
  node: ElementNode,
  context: TransformContext,
  buildSlotFn: SlotFnBuilder = buildClientSlotFn
): {
  slots: SlotsExpression
  hasDynamicSlots: boolean
} {
  context.helper(WITH_CTX)

  const { children, loc } = node
  const slotsProperties: Property[] = []

  const buildDefaultSlotProperty = (
    props: ExpressionNode | undefined,
    children: TemplateChildNode[]
  ) => createObjectProperty(`default`, buildSlotFn(props, children, loc))

  // If the slot is inside a v-for or another v-slot, force it to be dynamic
  // since it likely uses a scope variable.
  // 如果 slot 是在 v-for 或另一个  v-slot 里面强制它成为一个动态的
  let hasDynamicSlots = context.scopes.vSlot > 0 || context.scopes.vFor > 0
  // with `prefixIdentifiers: true`, this can be further optimized to make
  // it dynamic only when the slot actually uses the scope variables.
  if (!__BROWSER__ && !context.ssr && context.prefixIdentifiers) {
    hasDynamicSlots = hasScopeRef(node, context.identifiers)
  }

  // 1. <Comp v-slot="{ prop }"/> 检查 slot 和 slotProps 应用在组件自身
  const onComponentSlot = findDir(node, 'slot', true)
  // TODO

  // 2. 遍历所有 children 检查是否存在 <template v-slot:foo="{prop}">
  let hasTemplateSlots = false
  const implicitDefaultChildren: TemplateChildNode[] = []
  // const seenSlotNames = new Set<string>()

  for (let i = 0; i < children.length; i++) {
    const slotElement = children[i]
    let slotDir

    // 不是 <template> 或没有 v-slot
    if (
      !isTemplateNode(slotElement) ||
      !(slotDir = findDir(slotElement, 'slot', true))
    ) {
      // 不是 <template v-slot> 跳过不处理
      if (slotElement.type !== NodeTypes.COMMENT) {
        implicitDefaultChildren.push(slotElement)
      }
      continue
    }

    // TODO more
  }

  if (!onComponentSlot) {
    if (!hasTemplateSlots) {
      // implicit default slot (on component)
      // <Comp><div/></Comp> 内的 <div/> 作为默认插槽
      slotsProperties.push(buildDefaultSlotProperty(undefined, children))
    } else if (implicitDefaultChildren.length) {
      // TODO
    }
  }

  const slotFlag = hasDynamicSlots
    ? SlotFlags.DYNAMIC
    : hasForwardedSlots(node.children)
      ? SlotFlags.FORWARDED
      : SlotFlags.STABLE

  // 增加 `_` 属性，标识该 slot 类型，1-stable,2-forwarded,3-dynamic
  let slots = createObjectExpression(
    slotsProperties.concat(
      createObjectProperty(
        `_`,
        // 2 = compiled but dynamic = can skip normalization, but must run diff
        // 1 = compiled and static = can skip normalization AND diff as optimized
        createSimpleExpression(
          slotFlag + (__DEV__ ? ` /* ${slotFlagsText[slotFlag]} */` : ``),
          false
        )
      )
    ),
    loc
  ) as SlotsExpression

  // TODO 动态插槽， v-slot:[name]="slotProps"

  return { slots, hasDynamicSlots }
}

function hasForwardedSlots(children: TemplateChildNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    // 满足条件的下面情况
    // 1. child 必须是 1,ELEMENT 类型
    // 2. <slot> 或 <element>且孩子节点下有满足 1&2情况
    if (child.type === NodeTypes.ELEMENT) {
      if (
        child.tagType === ElementTypes.SLOT ||
        (child.tagType === ElementTypes.ELEMENT &&
          hasForwardedSlots(child.children))
      ) {
        return true
      }
    }
  }

  return false
}
