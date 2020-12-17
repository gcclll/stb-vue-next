import { NodeTypes, NodeTransform, ElementTypes } from '@vue/compiler-core'
import { createDOMCompilerError, DOMErrorCodes } from '../errors'

export const ignoreSideEffectTags: NodeTransform = (node, context) => {
  if (
    node.type === NodeTypes.ELEMENT &&
    node.tagType === ElementTypes.ELEMENT &&
    (node.tag === 'script' || node.tag === 'style')
  ) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_IGNORED_SIDE_EFFECT_TAG, node.loc)
    )
    context.removeNode()
  }
}
