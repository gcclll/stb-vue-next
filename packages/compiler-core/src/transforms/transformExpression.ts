import { ExpressionNode, SimpleExpressionNode } from '../ast'
import { TransformContext } from '../transform'

// Important: since this function uses Node.js only dependencies, it should
// always be used with a leading !__BROWSER__ check so that it can be
// tree-shaken from the browser build.
export function processExpression(
  node: SimpleExpressionNode,
  context: TransformContext,
  // some expressions like v-slot props & v-for aliases should be parsed as
  // function params
  asParams = false,
  // v-on handler values may contain multiple statements
  asRowStatements = false
): ExpressionNode {
  return {} as ExpressionNode
}
