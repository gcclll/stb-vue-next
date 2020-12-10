import { DirectiveNode, ElementNode, ExpressionNode, ForNode } from '../ast'
import {
  createStructuralDirectiveTransform,
  TransformContext
} from '../transform'

export interface ForParseResult {
  source: ExpressionNode
  value: ExpressionNode | undefined
  key: ExpressionNode | undefined
  index: ExpressionNode | undefined
}

export const transformFor = createStructuralDirectiveTransform(
  'for',
  (node, dir, context) => {
    // const { helper } = context
    return processFor(node, dir, context, forNode => {
      console.log(forNode)

      return () => {}
    })
  }
)

// target-agnostic transform used for both Client and SSR
export function processFor(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (forNode: ForNode) => (() => void) | undefined
) {
  // TODO
}
