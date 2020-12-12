import { SlotFlags, slotFlagsText } from '@vue/shared'
import {
  CallExpression,
  ConditionalExpression,
  createArrayExpression,
  createCallExpression,
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
  ObjectExpression,
  Property,
  SimpleExpressionNode,
  SlotsExpression,
  SourceLocation,
  TemplateChildNode
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { CREATE_SLOTS, RENDER_LIST, WITH_CTX } from '../runtimeHelpers'
import { NodeTransform, TransformContext } from '../transform'
import {
  assert,
  findDir,
  hasScopeRef,
  isStaticExp,
  isTemplateNode
} from '../utils'
import { createForLoopParams, parseForExpression } from './vFor'

const defaultFallback = createSimpleExpression(`undefined`, false)

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
  const dynamicSlots: (ConditionalExpression | CallExpression)[] = []

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
  if (onComponentSlot) {
    const { arg, exp } = onComponentSlot
    if (arg && !isStaticExp(arg)) {
      hasDynamicSlots = true
    }
    slotsProperties.push(
      createObjectProperty(
        arg || createSimpleExpression('default', true),
        buildSlotFn(exp, children, loc)
      )
    )
  }

  // 2. 遍历所有 children 检查是否存在 <template v-slot:foo="{prop}">
  let hasTemplateSlots = false
  let hasNamedDefaultSlot = false
  const implicitDefaultChildren: TemplateChildNode[] = []
  const seenSlotNames = new Set<string>()

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

    if (onComponentSlot) {
      // 组件上已经有v-slot 的时候，里面所有孩子都不能在使用 v-slot
      context.onError(
        createCompilerError(ErrorCodes.X_V_SLOT_MIXED_SLOT_USAGE, slotDir.loc)
      )
      break
    }

    hasTemplateSlots = true
    const { children: slotChildren, loc: slotLoc } = slotElement
    const {
      arg: slotName = createSimpleExpression(`default`, true),
      exp: slotProps,
      loc: dirLoc
    } = slotDir

    // check if name is dynamic
    let staticSlotName: string | undefined
    if (isStaticExp(slotName)) {
      staticSlotName = slotName ? slotName.content : `default`
    } else {
      // dynamic slot name, v-slot:[name]="slotProps"
      hasDynamicSlots = true
    }

    const slotFunction = buildSlotFn(slotProps, slotChildren, slotLoc)
    // check if this slot is conditional (v-if/v-for)
    let vIf: DirectiveNode | undefined
    let vElse: DirectiveNode | undefined
    let vFor: DirectiveNode | undefined
    if ((vIf = findDir(slotElement, 'if'))) {
      // v-slot with v-if
      hasDynamicSlots = true
      dynamicSlots.push(
        createConditionalExpression(
          vIf.exp!,
          buildDynamicSlot(slotName, slotFunction),
          defaultFallback
        )
      )
    } else if (
      (vElse = findDir(slotElement, /^else(-if)?$/, true /* allowEmpty */))
    ) {
      // v-else/if on slot
      let j = i
      let prev
      while (j--) {
        // 找到相邻的 v-if
        prev = children[j]
        if (prev.type !== NodeTypes.COMMENT) {
          break
        }
      }

      if (prev && isTemplateNode(prev) && findDir(prev, 'if')) {
        // remove node
        children.splice(i, 1)
        i--
        __TEST__ && assert(dynamicSlots.length > 0)
        // attach this slot to previous conditional
        let conditional = dynamicSlots[
          dynamicSlots.length - 1
        ] as ConditionalExpression

        while (
          conditional.alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION
        ) {
          conditional = conditional.alternate
        }

        conditional.alternate = vElse.exp
          ? createConditionalExpression(
              vElse.exp,
              buildDynamicSlot(slotName, slotFunction),
              defaultFallback
            )
          : buildDynamicSlot(slotName, slotFunction)
      } else {
        context.onError(
          createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, vElse.loc)
        )
      }
    } else if ((vFor = findDir(slotElement, 'for'))) {
      hasDynamicSlots = true
      const parseResult =
        vFor.parseResult ||
        parseForExpression(vFor.exp as SimpleExpressionNode, context)

      if (parseResult) {
        // Render the dynamic slots as an array and add it to the createSlot()
        // args. The runtime knows how to handle it appropriately.
        dynamicSlots.push(
          createCallExpression(context.helper(RENDER_LIST), [
            parseResult.source,
            createFunctionExpression(
              createForLoopParams(parseResult),
              buildDynamicSlot(slotName, slotFunction),
              true /* force newline */
            )
          ])
        )
      } else {
        context.onError(
          createCompilerError(ErrorCodes.X_V_FOR_MALFORMED_EXPRESSION, vFor.loc)
        )
      }
    } else {
      // 检查静态属性名是否有重复的
      if (staticSlotName) {
        if (seenSlotNames.has(staticSlotName)) {
          context.onError(
            createCompilerError(
              ErrorCodes.X_V_SLOT_DUPLICATE_SLOT_NAMES,
              dirLoc
            )
          )

          continue
        }

        seenSlotNames.add(staticSlotName)
        if (staticSlotName === 'default') {
          // 显式的使用了默认插槽名称
          hasNamedDefaultSlot = true
        }
      }

      slotsProperties.push(createObjectProperty(slotName, slotFunction))
    }
  }

  if (!onComponentSlot) {
    if (!hasTemplateSlots) {
      // implicit default slot (on component)
      // <Comp><div/></Comp> 内的 <div/> 作为默认插槽
      slotsProperties.push(buildDefaultSlotProperty(undefined, children))
    } else if (implicitDefaultChildren.length) {
      // 1. 非 <Comp v-slot="slotProps">
      // 2. 存在 <template v-slot>
      // 3. 且存在其他非 template 类型的节点
      // 4. 如果有 <template v-slot:default="slotProps"> 时候视为非法
      // 因为其他非 template 类型的节点会被视为默认插槽内容
      if (hasNamedDefaultSlot) {
        context.onError(
          createCompilerError(
            ErrorCodes.X_V_SLOT_EXTRANEOUS_DEFAULT_SLOT_CHILDREN,
            implicitDefaultChildren[0].loc
          )
        )
      } else {
        slotsProperties.push(
          buildDefaultSlotProperty(undefined, implicitDefaultChildren)
        )
      }
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

  // 动态插槽， v-slot:[name]="slotProps" 或在 v-if/v-for 指令中都是为动态
  if (dynamicSlots.length) {
    slots = createCallExpression(context.helper(CREATE_SLOTS), [
      slots,
      createArrayExpression(dynamicSlots)
    ]) as SlotsExpression
  }

  return { slots, hasDynamicSlots }
}

function buildDynamicSlot(
  name: ExpressionNode,
  fn: FunctionExpression
): ObjectExpression {
  return createObjectExpression([
    createObjectProperty(`name`, name),
    createObjectProperty(`fn`, fn)
  ])
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
