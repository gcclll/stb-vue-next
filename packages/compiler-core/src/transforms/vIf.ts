import { DirectiveNode, ElementNode, IfBranchNode, IfNode } from '../ast'
import {
  createStructuralDirectiveTransform,
  TransformContext
} from '../transform'

export const transformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  (node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
      // TODO
      console.log(ifNode, branch, isRoot)
      return () => {}
    })
  }
)

export function processIf(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (
    node: IfNode,
    branch: IfBranchNode,
    isRoot: boolean
  ) => (() => void) | undefined
) {}
