import {
  createSimpleExpression,
  NodeTypes,
  createCompoundExpression,
  createObjectProperty,
  ElementTypes,
  Property,
  ConstantTypes,
  ExpressionNode
} from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { BindingTypes } from '../options'
import { IS_REF } from '../runtimeHelpers'
import { DirectiveTransform } from '../transform'
import {
  hasScopeRef,
  isMemberExpression,
  isSimpleIdentifier,
  isStaticExp
} from '../utils'

export const transformModel: DirectiveTransform = (dir, node, context) => {
  const { exp, arg } = dir
  if (!exp) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_NO_EXPRESSION, dir.loc)
    )
    return createTransformProps()
  }

  const rawExp = exp.loc.source
  const expString =
    exp.type === NodeTypes.SIMPLE_EXPRESSION ? exp.content : rawExp

  // im SFC <script setup> inline mode, the exp may have been transformed into
  // _unref(exp)
  const bindingType = context.bindingMetadata[rawExp]
  const maybeRef =
    !__BROWSER__ &&
    context.inline &&
    bindingType &&
    bindingType !== BindingTypes.SETUP_CONST

  if (!isMemberExpression(expString) && !maybeRef) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_MALFORMED_EXPRESSION, exp.loc)
    )
    return createTransformProps()
  }

  if (
    !__BROWSER__ &&
    context.prefixIdentifiers &&
    isSimpleIdentifier(expString) &&
    context.identifiers[expString]
  ) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_ON_SCOPE_VARIABLE, exp.loc)
    )
    return createTransformProps()
  }

  const propName = arg ? arg : createSimpleExpression('modelValue', true)
  const eventName = arg
    ? isStaticExp(arg)
      ? `onUpdate:${arg.content}`
      : createCompoundExpression(['"onUpdate:" + ', arg])
    : `onUpdate:modelValue`

  let assignmentExp: ExpressionNode
  const eventArg = context.isTS ? `($event: any)` : `$event`
  if (maybeRef) {
    if (bindingType === BindingTypes.SETUP_REF) {
      // v-model used on known ref.
      assignmentExp = createCompoundExpression([
        `${eventArg} => (`,
        createSimpleExpression(rawExp, false, exp.loc),
        `.value = $event)`
      ])
    } else {
      // v-model used on a potentially ref binding in <script setup> inline mode.
      // the assignment needs to check whether the binding is actually a ref.
      const altAssignment =
        bindingType === BindingTypes.SETUP_LET ? `${rawExp} = $event` : `null`
      // -> $event => (isRef(exp) ? exp.value = $event : exp = $event)
      assignmentExp = createCompoundExpression([
        `${eventArg} => (${context.helperString(IS_REF)}(${rawExp}) ? `,
        createSimpleExpression(rawExp, false, exp.loc),
        `.value = $event : ${altAssignment})`
      ])
    }
  } else {
    // -> $event => (value = $event)
    assignmentExp = createCompoundExpression([
      `${eventArg} => (`,
      exp,
      ` = $event)`
    ])
  }

  const props = [
    // modelValue: foo
    createObjectProperty(propName, dir.exp!),
    // "onUpdate:modelValue": $event => (foo = $event)
    createObjectProperty(eventName, assignmentExp)
  ]

  // cache v-model handler if applicable (when it doesn't refer any scope vars)
  if (
    !__BROWSER__ &&
    context.prefixIdentifiers &&
    context.cacheHandlers &&
    !hasScopeRef(exp, context.identifiers)
  ) {
    props[1].value = context.cache(props[1].value)
  }

  // modelModifiers: { foo: true, "bar-baz": true }
  if (dir.modifiers.length && node.tagType === ElementTypes.COMPONENT) {
    const modifiers = dir.modifiers
      .map(m => (isSimpleIdentifier(m) ? m : JSON.stringify(m)) + `: true`)
      .join(`, `)

    const modifiersKey = arg
      ? isStaticExp(arg)
        ? `${arg.content}Modifiers`
        : createCompoundExpression([arg, ' + "Modifiers"'])
      : `modelModifiers`

    props.push(
      createObjectProperty(
        modifiersKey,
        createSimpleExpression(
          `{ ${modifiers} }`,
          false,
          dir.loc,
          ConstantTypes.CAN_HOIST
        )
      )
    )
  }

  return createTransformProps(props)
}

function createTransformProps(props: Property[] = []) {
  return { props }
}
