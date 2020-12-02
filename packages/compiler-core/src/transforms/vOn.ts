import { DirectiveNode, ExpressionNode, SimpleExpressionNode } from '../ast'
import { DirectiveTransform } from '../transform'

// const fnExpRE = /^\s*([\w$_]+|\([^)]*?\))\s*=>|^\s*function(?:\s+[\w$]+)?\s*\(/

export interface VonDirectiveNode extends DirectiveNode {
  // v-on without arg is handled directly in ./transformElements.ts due to it affecting
  // codegen for the entire props object. This transform here is only for v-on
  // *with* args.
  arg: ExpressionNode
  // exp is guaranteed to be a simple expression here because v-on w/ arg is
  // skipped by transformExpression as a special case.
  exp: SimpleExpressionNode | undefined
}

export const transformOn: DirectiveTransform = (
  dir,
  node,
  context,
  augmentor
) => {}
