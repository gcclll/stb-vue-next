import {
  createConditionalExpression,
  createDOMCompilerError,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  DirectiveTransform,
  DOMErrorCodes
} from '@vue/compiler-dom'

export const ssrTransformShow: DirectiveTransform = (dir, node, context) => {
  if (!dir.exp) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_SHOW_NO_EXPRESSION)
    )
  }

  return {
    props: [
      createObjectProperty(
        `style`,
        // -> dir.exp ? `null` : `display:none`
        createConditionalExpression(
          dir.exp!,
          createSimpleExpression(`null`, false),
          createObjectExpression([
            createObjectProperty(
              `display`,
              createSimpleExpression(`none`, true)
            )
          ]),
          false /* no newline */
        )
      )
    ]
  }
}
