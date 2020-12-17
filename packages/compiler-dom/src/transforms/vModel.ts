import {
  DirectiveTransform,
  ElementTypes,
  findProp,
  hasDynamicKeyVBind,
  NodeTypes,
  transformModel as baseTransform
} from '@vue/compiler-core'
import { createDOMCompilerError, DOMErrorCodes } from '../errors'
import {
  V_MODEL_CHECKBOX,
  V_MODEL_DYNAMIC,
  V_MODEL_RADIO,
  V_MODEL_SELECT,
  V_MODEL_TEXT
} from '../runtimeHelpers'

export const transformModel: DirectiveTransform = (dir, node, context) => {
  const baseResult = baseTransform(dir, node, context)
  // base transform has errors OR component v-model (only need props)
  // 没有 v-model指令，或应用在用户组件上了
  if (!baseResult.props.length || node.tagType === ElementTypes.COMPONENT) {
    return baseResult
  }

  // 不能有参数？
  if (dir.arg) {
    context.onError(
      createDOMCompilerError(
        DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT,
        dir.arg.loc
      )
    )
  }

  // 不能有 value 属性，因为 input 绑定的就是 value 属性
  function checkDuplicateValue() {
    const value = findProp(node, 'value')
    if (value) {
      context.onError(
        createDOMCompilerError(
          DOMErrorCodes.X_V_MODEL_UNNECESSARY_VALUE,
          value.loc
        )
      )
    }
  }

  const { tag } = node
  const isCustomElement = context.isCustomElement(tag)
  if (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    isCustomElement
  ) {
    let directiveToUse = V_MODEL_TEXT
    let isInvalidType = false
    if (tag === 'input' || isCustomElement) {
      const type = findProp(node, `type`)
      if (type) {
        if (type.type === NodeTypes.DIRECTIVE) {
          // :type='foo'
          directiveToUse = V_MODEL_DYNAMIC
        } else if (type.value) {
          switch (type.value.content) {
            case 'radio':
              directiveToUse = V_MODEL_RADIO
              break
            case 'checkbox':
              directiveToUse = V_MODEL_CHECKBOX
              break
            case 'file':
              isInvalidType = true
              context.onError(
                createDOMCompilerError(
                  DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT,
                  dir.loc
                )
              )

              break
            default:
              __DEV__ && checkDuplicateValue()
              break
          }
        }
      } else if (hasDynamicKeyVBind(node)) {
        // element has bindings with dynamic keys, which can possibly contain
        // "type".
        directiveToUse = V_MODEL_DYNAMIC
      } else {
        // text type
        __DEV__ && checkDuplicateValue()
      }
    } else if (tag === 'select') {
      directiveToUse = V_MODEL_SELECT
    } else {
      // textarea
      __DEV__ && checkDuplicateValue()
    }

    // inject runtime directive
    // by returning the helper symbol via needRuntime
    // the import will replaced a resolveDirective call.
    if (!isInvalidType) {
      baseResult.needRuntime = context.helper(directiveToUse)
    }
  } else {
    context.onError(
      createDOMCompilerError(
        DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT,
        dir.loc
      )
    )
  }

  // native vmodel doesn't need the `modelValue` props since they are also
  // passed to the runtime as `binding.value`. removing it reduces code size.
  baseResult.props = baseResult.props.filter(
    p =>
      !(
        p.key.type === NodeTypes.SIMPLE_EXPRESSION &&
        p.key.content === 'modelValue'
      )
  )
  return baseResult
}
