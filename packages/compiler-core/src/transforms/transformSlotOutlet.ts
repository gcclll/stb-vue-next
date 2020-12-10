import {
  CallExpression,
  createCallExpression,
  createFunctionExpression,
  ExpressionNode,
  NodeTypes,
  SlotOutletNode
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { RENDER_SLOT } from '../runtimeHelpers'
import { NodeTransform, TransformContext } from '../transform'
import { findProp, isSlotOutlet } from '../utils'
import { buildProps, PropsExpression } from './transformElement'

export const transformSlotOutlet: NodeTransform = (node, context) => {
  if (isSlotOutlet(node)) {
    const { children, loc } = node
    const { slotName, slotProps } = processSlotOutlet(node, context)

    // 内容：
    // 1. $slots, 数据源
    // 2. slotName, 插槽名
    // 3. slotProps, 插槽属性
    // 4. children, 插槽的孩子节点
    const slotArgs: CallExpression['arguments'] = [
      context.prefixIdentifiers ? `_ctx.$slots` : `$slots`,
      slotName
    ]

    // slot 属性
    if (slotProps) {
      slotArgs.push(slotProps)
    }

    if (children.length) {
      if (!slotProps) {
        slotArgs.push(`{}`)
      }

      slotArgs.push(createFunctionExpression([], children, false, false, loc))
    }

    node.codegenNode = createCallExpression(
      context.helper(RENDER_SLOT),
      slotArgs,
      loc
    )
  }
}

interface SlotOutletProcessResult {
  slotName: string | ExpressionNode
  slotProps: PropsExpression | undefined
}

export function processSlotOutlet(
  node: SlotOutletNode,
  context: TransformContext
): SlotOutletProcessResult {
  let slotName: string | ExpressionNode = `"default"`
  let slotProps: PropsExpression | undefined = undefined

  // check for <slot name="xxx" OR :name="xxx" />
  const name = findProp(node, 'name')
  if (name) {
    if (name.type === NodeTypes.ATTRIBUTE && name.value) {
      // 静态名字
      slotName = JSON.stringify(name.value.content)
    } else if (name.type === NodeTypes.DIRECTIVE && name.exp) {
      // 动态插槽名
      slotName = name.exp
    }
  }

  // 过滤出不含 `name` 的属性
  const propsWithoutName = name
    ? node.props.filter(p => p !== name)
    : node.props
  if (propsWithoutName.length > 0) {
    // -> { properties: [...], type: 15,JS_OBJECT_EXPRSSIOn }
    const { props, directives } = buildProps(node, context, propsWithoutName)
    slotProps = props
    if (directives.length) {
      // 插槽上不允许有指令
      context.onError(
        createCompilerError(
          ErrorCodes.X_V_SLOT_UNEXPECTED_DIRECTIVE_ON_SLOT_OUTLET,
          directives[0].loc
        )
      )
    }
  }

  return {
    slotName,
    slotProps
  }
}
