import {
  createDOMCompilerError,
  createObjectProperty,
  DirectiveTransform,
  DOMErrorCodes,
  ElementTypes,
  findProp,
  hasDynamicKeyVBind,
  transformModel
} from '@vue/compiler-dom'
import { DirectiveTransformResult } from 'packages/compiler-core/src/transform'

export const ssrTransformModel: DirectiveTransform = (dir, node, context) => {
  const model = dir.exp!

  function checkDuplicatedValue() {
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

  if (node.tagType === ElementTypes.ELEMENT) {
    const res: DirectiveTransformResult = { props: [] }
    const defaultProps = [
      // 默认 value, <input type="text">
      createObjectProperty(`value`, model)
    ]

    if (node.tag === 'input') {
      const type = findProp(node, 'type')
      if (type) {
      } else if (hasDynamicKeyVBind(node)) {
        // 动态类型 -> 动态 v-bind
        // NOOP, 在 ssrTransformElement 中处理，需要重写整个 props 表达式
      } else {
        // 默认 text type
        checkDuplicatedValue()
        res.props = defaultProps
      }
    } else if (node.tag === 'textarea') {
    } else if (node.tag === 'select') {
      // NOOP
      // select relies on client-side directive to set initial selected state.
    } else {
      context.onError(
        createDOMCompilerError(
          DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT,
          dir.loc
        )
      )
    }

    return res
  } else {
    // component v-model
    return transformModel(dir, node, context)
  }
}
