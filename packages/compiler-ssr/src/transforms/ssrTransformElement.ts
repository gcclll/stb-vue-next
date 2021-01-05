import { processChildren, SSRTransformContext } from '../ssrCodegenTransform'
import { NO } from '@vue/shared'
import {
  createTemplateLiteral,
  ElementTypes,
  NodeTransform,
  NodeTypes,
  PlainElementNode,
  TemplateLiteral,
  createSimpleExpression,
  hasDynamicKeyVBind,
  buildProps,
  createCallExpression
} from '@vue/compiler-dom'
import { SSR_RENDER_ATTRS } from '../runtimeHelpers'

// for directives with children overwrite (e.g. v-html & v-text), we need to
// store the raw children so that they can be added in the 2nd pass.
const rawChildrenMap = new WeakMap<
  PlainElementNode,
  TemplateLiteral['elements'][0]
>()

export const ssrTransformElement: NodeTransform = (node, context) => {
  if (
    node.type !== NodeTypes.ELEMENT ||
    node.tagType !== ElementTypes.ELEMENT
  ) {
    return
  }
  return function ssrPostTransformElement() {
    // 生成开始标签
    const openTag: TemplateLiteral['elements'] = [`<${node.tag}`]

    // some tags need to be passed to runtime for special checks
    // 需要运行时做特殊处理
    const needTagForRuntime =
      node.tag === 'textarea' || node.tag.indexOf('-') > 0
    // 1. TODO v-bind
    // v-bind="obj" or v-bind:[key] can potentially overwrite other static
    // attrs and can affect final rendering result, so when they are present
    // we need to bail out to full `renderAttrs`
    const hasDynamicVBind = hasDynamicKeyVBind(node)
    if (hasDynamicVBind) {
      const { props } = buildProps(node, context, node.props, true /* ssr */)
      if (props) {
        const propsExp = createCallExpression(
          context.helper(SSR_RENDER_ATTRS),
          [props]
        )

        if (node.tag === 'textarea') {
          // TODO
        } else if (node.tag === 'input') {
          // TODO
        }

        if (needTagForRuntime) {
          propsExp.arguments.push(`"${node.tag}"`)
        }

        openTag.push(propsExp)
      }
    }
    // 2. TODO class 处理(静态/动态)
    // 3. TODO style 处理
    // 4. TODO node.props 处理
    // 5. TODO 动态+静态 class 同时存在情况，合并成动态

    if (context.scopeId) {
      openTag.push(` ${context.scopeId}`)
    }

    node.ssrCodegenNode = createTemplateLiteral(openTag)
  }
}

export function ssrProcessElement(
  node: PlainElementNode,
  context: SSRTransformContext
) {
  const isVoidTag = context.options.isVoidTag || NO
  const elementsToAdd = node.ssrCodegenNode!.elements
  for (let j = 0; j < elementsToAdd.length; j++) {
    context.pushStringPart(elementsToAdd[j])
  }

  // slot scopeId 处理
  if (context.withSlotScopeId) {
    context.pushStringPart(createSimpleExpression(`_scopeId`, false))
  }

  // close open tag
  context.pushStringPart(`>`)

  // 已缓存的处理结果
  const rawChildren = rawChildrenMap.get(node)
  if (rawChildren) {
    context.pushStringPart(rawChildren)
  } else if (node.children.length) {
    processChildren(node.children, context)
  }

  if (!isVoidTag(node.tag)) {
    // push closing tag
    context.pushStringPart(`</${node.tag}>`)
  }
}
