import { camelize, toHandlerKey } from '@vue/shared'
import {
  createObjectProperty,
  createSimpleExpression,
  DirectiveNode,
  ExpressionNode,
  NodeTypes,
  SimpleExpressionNode,
  createCompoundExpression
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { TO_HANDLER_KEY } from '../runtimeHelpers'
import { DirectiveTransform, DirectiveTransformResult } from '../transform'
import { isMemberExpression } from '../utils'
import { validateBrowserExpression } from '../validateExpression'

const fnExpRE = /^\s*([\w$_]+|\([^)]*?\))\s*=>|^\s*function(?:\s+[\w$]+)?\s*\(/

export interface VOnDirectiveNode extends DirectiveNode {
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
) => {
  const { loc, modifiers, arg } = dir as VOnDirectiveNode

  if (!dir.exp && !modifiers.length) {
    context.onError(createCompilerError(ErrorCodes.X_V_ON_NO_EXPRESSION, loc))
  }

  let eventName: ExpressionNode

  if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
    if (arg.isStatic) {
      // v-on:click
      const rawName = arg.content
      // for all event listeners, auto convert it to camelCase. See issue #2249
      eventName = createSimpleExpression(
        toHandlerKey(camelize(rawName)),
        true,
        arg.loc
      )
    } else {
      // #2388
      // 动态事件参数 <div v-on:[eventName] ...
      eventName = createCompoundExpression([
        `${context.helperString(TO_HANDLER_KEY)}(`,
        arg,
        `)`
      ])
    }
  } else {
    // already a compound expression.
    eventName = arg
    eventName.children.unshift(`${context.helperString(TO_HANDLER_KEY)}(`)
    eventName.children.push(`)`)
  }

  // handler processing
  let exp: ExpressionNode | undefined = dir.exp as
    | SimpleExpressionNode
    | undefined

  if (exp && !exp.content.trim()) {
    exp = undefined
  }

  let shouldCache: boolean = context.cacheHandlers && !exp
  if (exp) {
    const isMemberExp = isMemberExpression(exp.content)
    const isInlineStatement = !(isMemberExp || fnExpRE.test(exp.content))
    // 含多个表达式
    const hasMultipleStatements = exp.content.includes(';')

    // process the expression since it's been skipped
    if (!__BROWSER__ && context.prefixIdentifiers) {
      // TODO
    }

    if (__DEV__ && __BROWSER__) {
      validateBrowserExpression(
        exp as SimpleExpressionNode,
        context,
        false,
        hasMultipleStatements
      )
    }

    if (isInlineStatement || (shouldCache && isMemberExp)) {
      // wrap inline statement in a function expression
      exp = createCompoundExpression([
        `${
          isInlineStatement
            ? !__BROWSER__ && context.isTS
              ? `($event: any)`
              : `$event`
            : `${
                !__BROWSER__ && context.isTS ? `\n//@ts-ignore\n` : ``
              }(...args)`
        } => ${hasMultipleStatements ? `{` : `(`}`,
        exp,
        hasMultipleStatements ? `}` : `)`
      ])
    }
  }

  let ret: DirectiveTransformResult = {
    props: [
      createObjectProperty(
        eventName,
        exp || createSimpleExpression(`() => {}`, false, loc)
      )
    ]
  }

  // apply extended compiler augmentor
  if (augmentor) {
    ret = augmentor(ret)
  }

  if (shouldCache) {
    // cache handlers so that it's always the same handler being passed down.
    // this avoids unnecessary re-renders when users use inline handlers on
    // components.
    ret.props[0].value = context.cache(ret.props[0].value)
  }

  return ret
}
