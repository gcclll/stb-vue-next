import { processChildren, SSRTransformContext } from '../ssrCodegenTransform'
import { escapeHtml, NO } from '@vue/shared'
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
  createCallExpression,
  CallExpression,
  DirectiveNode,
  AttributeNode,
  isStaticExp,
  createInterpolation,
  createCompilerError,
  ErrorCodes,
  JSChildNode,
  ExpressionNode,
  ArrayExpression,
  createArrayExpression
} from '@vue/compiler-dom'
import {
  SSR_RENDER_ATTRS,
  SSR_RENDER_CLASS,
  SSR_RENDER_DYNAMIC_ATTR,
  SSR_RENDER_STYLE
} from '../runtimeHelpers'
import { createSSRCompilerError, SSRErrorCodes } from '../error'

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
    // 2. class 处理(静态/动态)
    let dynamicClassBinding: CallExpression | undefined = undefined
    let staticClassBinding: string | undefined = undefined
    // 3. style 处理
    // all style bindings are converted to dynamic by transformStyle.
    // but we need to make sure to merge them.
    // 所有 style 会被 transformStyle 合并成动态的，这里主要是确保有没合并
    let dynamicStyleBinding: CallExpression | undefined = undefined

    // 4. TODO node.props 处理
    // 5. TODO 动态+静态 class 同时存在情况，合并成动态

    for (let i = 0; i < node.props.length; i++) {
      const prop = node.props[i]
      // 忽略 input 上的 true 值或 false 值
      if (node.tag === 'input' && isTrueFalseValue(prop)) {
        continue
      }

      // special cases with children override
      if (prop.type === NodeTypes.DIRECTIVE) {
        // 指令处理
        if (prop.name === 'html' && prop.exp /* v-html */) {
          rawChildrenMap.set(node, prop.exp)
        } else if (false /* v-text */) {
          // TODO
        } else if (false /* v-slot */) {
          // TODO
        } else if (false /* textarea with value */) {
          // TODO
        } else {
          // 指令 transforms
          const directiveTransform = context.directiveTransforms[prop.name]
          if (!directiveTransform) {
            // 自定义指令必须提供 transform
            context.onError(
              createSSRCompilerError(
                SSRErrorCodes.X_SSR_CUSTOM_DIRECTIVE_NO_TRANSFORM,
                prop.loc
              )
            )
          } else if (!hasDynamicVBind) {
            // 非动态参数（v-bind:[key]）的指令
            const { props, ssrTagParts } = directiveTransform(
              prop,
              node,
              context
            )
            if (ssrTagParts) {
              openTag.push(...ssrTagParts)
            }

            for (let j = 0; j < props.length; j++) {
              const { key, value } = props[j]
              if (isStaticExp(key)) {
                let attrName = key.content
                // 静态 key attr
                if (attrName === 'key' || attrName === 'ref') {
                  continue
                }

                if (attrName === 'class') {
                  openTag.push(
                    ` class="`,
                    (dynamicClassBinding = createCallExpression(
                      context.helper(SSR_RENDER_CLASS),
                      [value]
                    )),
                    `"`
                  )
                } else if (attrName === 'style') {
                  // :style
                  if (dynamicStyleBinding) {
                    // 已经有 style 合并
                    mergeCall(dynamicStyleBinding, value)
                  } else {
                    openTag.push(
                      ` style="`,
                      (dynamicStyleBinding = createCallExpression(
                        context.helper(SSR_RENDER_STYLE),
                        [value]
                      )),
                      `"`
                    )
                  }
                } else {
                  // TODO other directive
                }
              } else {
                // 动态 Key 属性 v-bind:[key]
              }
            }
          }
        }
      } else {
        if (node.tag === 'textarea' && prop.name === 'value' && prop.value) {
          // TODO 特殊情况：value on <textarea>
        } else if (!hasDynamicVBind) {
          if (prop.name === 'key' || prop.name === 'ref') {
            continue
          }

          // static prop
          if (prop.name === 'class' && prop.value) {
            staticClassBinding = JSON.stringify(prop.value.content)
          }
          openTag.push(
            ` ${prop.name}` +
              (prop.value ? `="${escapeHtml(prop.value.content)}"` : ``)
          )
        }
      }
    }

    // TODO 静态动态同时存在时，合并到动态 class
    if (dynamicClassBinding && staticClassBinding) {
      mergeCall(dynamicClassBinding, staticClassBinding)
      removeStaticBinding(openTag, 'class')
    }

    if (context.scopeId) {
      openTag.push(` ${context.scopeId}`)
    }

    node.ssrCodegenNode = createTemplateLiteral(openTag)
  }
}

function isTrueFalseValue(prop: DirectiveNode | AttributeNode) {
  if (prop.type === NodeTypes.DIRECTIVE) {
    return (
      prop.name === 'bind' &&
      prop.arg &&
      isStaticExp(prop.arg) &&
      (prop.arg.content === 'true-value' || prop.arg.content === 'false-value')
    )
  } else {
    return prop.name === 'true-value' || prop.name === 'false.value'
  }
}

function mergeCall(call: CallExpression, arg: string | JSChildNode) {
  const existing = call.arguments[0] as ExpressionNode | ArrayExpression
  if (existing.type === NodeTypes.JS_ARRAY_EXPRESSION) {
    existing.elements.push(arg)
  } else {
    call.arguments[0] = createArrayExpression([existing, arg])
  }
}

function removeStaticBinding(
  tag: TemplateLiteral['elements'],
  binding: string
) {
  const regExp = new RegExp(`^ ${binding}=".+"$`)
  const i = tag.findIndex(e => typeof e === 'string' && regExp.test(e))

  if (i > -1) {
    tag.splice(i, 1)
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
