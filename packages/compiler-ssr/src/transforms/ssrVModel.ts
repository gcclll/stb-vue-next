import {
  createCallExpression,
  createConditionalExpression,
  createDOMCompilerError,
  createInterpolation,
  createObjectProperty,
  createSimpleExpression,
  DirectiveTransform,
  DOMErrorCodes,
  ElementTypes,
  ExpressionNode,
  findProp,
  hasDynamicKeyVBind,
  NodeTypes,
  PlainElementNode,
  transformModel
} from '@vue/compiler-dom'
import { DirectiveTransformResult } from 'packages/compiler-core/src/transform'
import {
  SSR_LOOSE_CONTAIN,
  SSR_LOOSE_EQUAL,
  SSR_RENDER_DYNAMIC_MODEL
} from '../runtimeHelpers'

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
        const value = findValueBinding(node)
        if (type.type === NodeTypes.DIRECTIVE) {
          // 动态类型
          res.ssrTagParts = [
            createCallExpression(context.helper(SSR_RENDER_DYNAMIC_MODEL), [
              type.exp!,
              model,
              value
            ])
          ]
        } else if (type.value) {
          // 静态类型
          switch (type.value.content) {
            case 'radio':
              res.props = [
                createObjectProperty(
                  `checked`,
                  createCallExpression(context.helper(SSR_LOOSE_EQUAL), [
                    model,
                    value
                  ])
                )
              ]
              break

            case 'checkbox':
              const trueValueBinding = findProp(node, 'true-value')
              if (trueValueBinding) {
                const trueValue =
                  trueValueBinding.type === NodeTypes.ATTRIBUTE
                    ? JSON.stringify(trueValueBinding.value!.content)
                    : trueValueBinding.exp!

                res.props = [
                  createObjectProperty(
                    `checked`,
                    createCallExpression(context.helper(SSR_LOOSE_EQUAL), [
                      model,
                      trueValue
                    ])
                  )
                ]
              } else {
                res.props = [
                  createObjectProperty(
                    `checked`,
                    createConditionalExpression(
                      createCallExpression(`Array.isArray`, [model]),
                      createCallExpression(context.helper(SSR_LOOSE_CONTAIN), [
                        model,
                        value
                      ]),
                      model
                    )
                  )
                ]
              }
              break

            case 'file':
              context.onError(
                createDOMCompilerError(
                  DOMErrorCodes.X_V_MODEL_ON_FILE_INPUT_ELEMENT,
                  dir.loc
                )
              )
              break
            default:
              checkDuplicatedValue()
              res.props = defaultProps
              break
          }
        }
      } else if (hasDynamicKeyVBind(node)) {
        // 动态类型 -> 动态 v-bind
        // NOOP, 在 ssrTransformElement 中处理，需要重写整个 props 表达式
      } else {
        // 默认 text type
        checkDuplicatedValue()
        res.props = defaultProps
      }
    } else if (node.tag === 'textarea') {
      checkDuplicatedValue()
      node.children = [createInterpolation(model, model.loc)]
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

function findValueBinding(node: PlainElementNode): ExpressionNode {
  const valueBinding = findProp(node, 'value')
  return valueBinding
    ? valueBinding.type === NodeTypes.DIRECTIVE
      ? valueBinding.exp!
      : createSimpleExpression(valueBinding.value!.content, true)
    : createSimpleExpression(`null`, false)
}
