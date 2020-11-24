import { SimpleExpressionNode, CompoundExpressionNode } from '../ast'
export type ExpressionNode = SimpleExpressionNode | CompoundExpressionNode

export interface ForParseResult {
  source: ExpressionNode
  value: ExpressionNode | undefined
  key: ExpressionNode | undefined
  index: ExpressionNode | undefined
}
