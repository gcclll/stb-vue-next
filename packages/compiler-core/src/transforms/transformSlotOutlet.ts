import { camelize } from '@vue/shared'
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
import { isBindKey, isSlotOutlet, isStaticExp } from '../utils'
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

  // 保存非 name="" 属性的其他属性
  const nonNameProps = []
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      // 静态属性
      if (p.value) {
        if (p.name === 'name') {
          slotName = JSON.stringify(p.value.content)
        } else {
          p.name = camelize(p.name)
          nonNameProps.push(p)
        }
      }
    } else {
      // 动态属性
      if (p.name === 'bind' && isBindKey(p.arg, 'name')) {
        // <slot :name="xx"></slot>
        if (p.exp) slotName = p.exp
      } else {
        // 非 name 的动态属性
        if (p.name === 'bind' && p.arg && isStaticExp(p.arg)) {
          p.arg.content = camelize(p.arg.content)
        }

        nonNameProps.push(p)
      }
    }
  }

  // 上面解析出 name 和非 name 的属性
  if (nonNameProps.length > 0) {
    const { props, directives } = buildProps(node, context, nonNameProps)
    slotProps = props

    if (directives.length) {
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
