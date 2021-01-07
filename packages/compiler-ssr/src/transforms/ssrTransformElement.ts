import { processChildren, SSRTransformContext } from '../ssrCodegenTransform'
import {
  escapeHtml,
  isBooleanAttr,
  isSSRSafeAttrName,
  NO,
  propsToAttrMap
} from '@vue/shared'
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
  createArrayExpression,
  isBindKey,
  TextNode,
  InterpolationNode,
  createAssignmentExpression,
  createConditionalExpression,
  createSequenceExpression,
  MERGE_PROPS
} from '@vue/compiler-dom'
import {
  SSR_GET_DYNAMIC_MODEL_PROPS,
  SSR_INTERPOLATE,
  SSR_RENDER_ATTR,
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
    // 1. v-bind
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
          const existingText = node.children[0] as
            | TextNode
            | InterpolationNode
            | undefined
          // If interpolation, this is dynamic <textarea> content, potentially
          // injected by v-model and takes higher priority than v-bind value
          // v-model 的优先级高于 v-bind value
          if (!existingText || existingText.type !== NodeTypes.INTERPOLATION) {
            // <textarea> with dynamic v-bind. We don't know if the final props
            // will contain .value, so we will have to do something special:
            // assign the merged props to a temp variable, and check whether
            // it contains value (if yes, render is as children).
            // 当 textarea 包含动态参数时，我们并不能确定最后的结果是否包含 .value
            // 因此我们将不得不做些特殊处理来应对：
            // 将已合并的 props 保存成一个临时变量，然后检查它是否包含 value 属性(如果
            // 包含，则将它当做 children 来渲染)
            const tempId = `_temp${context.temps++}`
            propsExp.arguments = [
              createAssignmentExpression(
                createSimpleExpression(tempId, false),
                props
              )
            ]

            rawChildrenMap.set(
              node,
              createCallExpression(context.helper(SSR_INTERPOLATE), [
                createConditionalExpression(
                  createSimpleExpression(`"value" in ${tempId}`, false),
                  createSimpleExpression(`${tempId}.value`, false),
                  createSimpleExpression(
                    existingText ? existingText.content : ``,
                    true
                  ),
                  false
                )
              ])
            )
          }
        } else if (node.tag === 'input') {
          // <input v-bind="obj" v-model>
          // we need to determine the props to render for the dynamic v-model
          // and merge it with the v-bind expression.
          const vModel = findVModel(node)
          if (vModel) {
            // 1. 保存 props 到临时变量
            const tempId = `_temp${context.temps++}`
            const tempExp = createSimpleExpression(tempId, false)
            propsExp.arguments = [
              createSequenceExpression([
                createAssignmentExpression(tempExp, props),
                createCallExpression(context.helper(MERGE_PROPS), [
                  tempExp,
                  createCallExpression(
                    context.helper(SSR_GET_DYNAMIC_MODEL_PROPS),
                    [
                      tempExp, // existing props
                      vModel.exp! // model
                    ]
                  )
                ])
              ])
            ]
          }
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

    // 4. node.props 处理

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
        } else if (prop.name === 'text' && prop.exp /* v-text */) {
          node.children = [createInterpolation(prop.exp, prop.loc)]
        } else if (prop.name === 'slot' /* v-slot */) {
          context.onError(
            createCompilerError(ErrorCodes.X_V_SLOT_MISPLACED, prop.loc)
          )
        } else if (
          isTextareaWithValue(node, prop) &&
          prop.exp /* textarea with value */
        ) {
          if (!hasDynamicVBind) {
            node.children = [createInterpolation(prop.exp, prop.loc)]
          }
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
                  // my-comp
                  attrName =
                    node.tag.indexOf('-') > 0
                      ? attrName // 保留自定义元素上的原始名称
                      : propsToAttrMap[attrName] || attrName.toLowerCase()

                  if (isBooleanAttr(attrName)) {
                    // boolean 类型属性
                    openTag.push(
                      createConditionalExpression(
                        value,
                        createSimpleExpression(' ' + attrName, true),
                        createSimpleExpression('', true),
                        false /* no newline */
                      )
                    )
                  } else if (isSSRSafeAttrName(attrName)) {
                    // 安全属性，不包含 ["'<>] 的名字
                    openTag.push(
                      createCallExpression(context.helper(SSR_RENDER_ATTR), [
                        key,
                        value
                      ])
                    )
                  } else {
                    context.onError(
                      createSSRCompilerError(
                        SSRErrorCodes.X_SSR_UNSAFE_ATTR_NAME,
                        key.loc
                      )
                    )
                  }
                }
              } else {
                // dynamic key attr
                // this branch is only encountered for custom directive
                // transforms that returns properties with dynamic keys
                const args: CallExpression['arguments'] = [key, value]
                if (needTagForRuntime) {
                  args.push(`"${node.tag}"`)
                }
                openTag.push(
                  createCallExpression(
                    context.helper(SSR_RENDER_DYNAMIC_ATTR),
                    args
                  )
                )
              }
            }
          }
        }
      } else {
        if (node.tag === 'textarea' && prop.name === 'value' && prop.value) {
          // 特殊情况：value on <textarea>
          rawChildrenMap.set(node, escapeHtml(prop.value.content))
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

    // 5. 动态+静态 class 同时存在情况，合并成动态
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
    return prop.name === 'true-value' || prop.name === 'false-value'
  }
}

function isTextareaWithValue(
  node: PlainElementNode,
  prop: DirectiveNode
): boolean {
  return !!(
    node.tag === 'textarea' &&
    prop.name === 'bind' &&
    isBindKey(prop.arg, 'value')
  )
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

function findVModel(node: PlainElementNode): DirectiveNode | undefined {
  return node.props.find(
    p => p.type === NodeTypes.DIRECTIVE && p.name === 'model' && p.exp
  ) as DirectiveNode | undefined
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
