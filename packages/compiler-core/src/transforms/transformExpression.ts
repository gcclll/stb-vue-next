// - Parse expressions in templates into compound expressions so that each
//   identifier gets more accurate source-map locations.
//
// - Prefix identifiers with `_ctx.` or `$xxx` (for known binding types) so that
//   they are accessed from the right source
//
// - This transform is only applied in non-browser builds because it relies on
//   an additional JavaScript parser. In the browser, there is no source-map
//   support and the code is wrapped in `with (this) { ... }`.
// - 解析模板中的表达式成组合表达式，以至于变量都能有自己的 source-map 位置信息
// - 在变量前面都加上 `_ctx.` 或 `$xxx` 来访问他们，确保他们的作用域正确
// - 这个 transform 只能应用于非浏览器环境，因为它依赖一些额外的 javascript 解析器。
import { NodeTransform, TransformContext } from '../transform'
import {
  CompoundExpressionNode,
  ConstantTypes,
  createCompoundExpression,
  createSimpleExpression,
  ExpressionNode,
  NodeTypes,
  SimpleExpressionNode
} from '../ast'
import { advancePositionWithClone, isSimpleIdentifier } from '../utils'
import {
  babelParserDefaultPlugins,
  hasOwn,
  isGloballyWhitelisted,
  isString,
  makeMap
} from '@vue/shared'
import { createCompilerError, ErrorCodes } from '../errors'
import {
  Identifier,
  Node,
  Function,
  ObjectProperty,
  AssignmentExpression,
  UpdateExpression
} from '@babel/types'
import { validateBrowserExpression } from '../validateExpression'
import { parse } from '@babel/parser'
import { walk } from 'estree-walker'
import { IS_REF, UNREF } from '../runtimeHelpers'
import { BindingTypes } from '../options'

const isLiteralWhitelisted = /*#__PURE__*/ makeMap('true,false,null,this')

export const transformExpression: NodeTransform = (node, context) => {
  if (node.type === NodeTypes.INTERPOLATION) {
    node.content = processExpression(
      node.content as SimpleExpressionNode,
      context
    )
  } else if (node.type === NodeTypes.ELEMENT) {
    // handle directives on element
    for (let i = 0; i < node.props.length; i++) {
      const dir = node.props[i]
      // 不处理 v-on & v-for 它们由自己的 transformXxx 处理
      if (dir.type === NodeTypes.DIRECTIVE && dir.name !== 'for') {
        const exp = dir.exp
        const arg = dir.arg
        // 不处理无表达式情况(v-on:arg)，应为对于内联表达式需要特殊处理
        if (
          exp &&
          exp.type === NodeTypes.SIMPLE_EXPRESSION &&
          !(dir.name === 'on' && arg)
        ) {
          dir.exp = processExpression(
            exp,
            context,
            // slot args must be processed as function params
            // slot 参数必须当做函数参数处理
            dir.name === 'slot'
          )
        }

        // 动态参数 v-bind:[arg]="exp"
        if (arg && arg.type === NodeTypes.SIMPLE_EXPRESSION && !arg.isStatic) {
          dir.arg = processExpression(arg, context)
        }
      }
    }
  }
}

interface PrefixMeta {
  prefix?: string
  isConstant: boolean
  start: number
  end: number
  scopeIds?: Set<string>
}

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
  asRawStatements = false
): ExpressionNode {
  if (__BROWSER__) {
    if (__DEV__) {
      // simple in-browser validation (same logic in 2.x)
      validateBrowserExpression(node, context, asParams, asRawStatements)
    }
    return node
  }

  // prefixIdentifiers 必须指定为 true
  if (!context.prefixIdentifiers || !node.content.trim()) {
    return node
  }

  const { inline, bindingMetadata } = context
  const rewriteIdentifier = (raw: string, parent?: Node, id?: Identifier) => {
    const type = hasOwn(bindingMetadata, raw) && bindingMetadata[raw]
    if (inline) {
      // x = y
      const isAssignmentLVal =
        parent && parent.type === 'AssignmentExpression' && parent.left === id
      // x++
      const isUpdateArg =
        parent && parent.type === 'UpdateExpression' && parent.argument === id
      // ({ x } = y)
      const isDestructureAssignment =
        parent && isInDestructureAssignment(parent, parentStack)

      if (type === BindingTypes.SETUP_CONST) {
        return raw
      } else if (type === BindingTypes.SETUP_REF) {
        return `${raw}.value`
      } else if (type === BindingTypes.SETUP_MAYBE_REF) {
        // const binding that may or may not be ref
        // if it's not a ref, then assignments don't make sense -
        // so we ignore the non-ref assignment case and generate code
        // that assumes the value to be a ref for more efficiency
        return isAssignmentLVal || isUpdateArg || isDestructureAssignment
          ? `${raw}.value`
          : `${context.helperString(UNREF)}(${raw})`
      } else if (type === BindingTypes.SETUP_LET) {
        if (isAssignmentLVal) {
          // let binding.
          // this is a bit more tricky as we need to cover the case where
          // let is a local non-ref value, and we need to replicate the
          // right hand side value.
          // x = y --> isRef(x) ? x.value = y : x = y
          // <script setup> 里面的变量赋值会变成对 x.value 的赋值
          const rVal = (parent as AssignmentExpression).right
          const rExp = rawExp.slice(rVal.start! - 1, rVal.end! - 1)
          const rExpString = stringifyExpression(
            processExpression(createSimpleExpression(rExp, false), context)
          )
          // 这里是干嘛？在 <script setup> 里面用 let 声明的变量最后会变成啥？
          // -> `isRef(raw) ? raw.value = exp string : raw`
          // 即：let 声明的变量如果是 ref 类型，会变成 raw.value = exp
          return `${context.helperString(IS_REF)}(${raw})${
            context.isTS ? ' //@ts-ignore\n' : ``
          } ? ${raw}.value = ${rExpString} : ${raw}`
        } else if (isUpdateArg) {
          // make id replace parent in the code range so the raw update operator
          // is removed
          // 自加表达式 i++
          id!.start = parent!.start
          id!.end = parent!.end
          const { prefix: isPrefix, operator } = parent as UpdateExpression
          const prefix = isPrefix ? operator : ``
          const postfix = isPrefix ? `` : operator
          // let binding
          // x++ --> isRef(a) ? a.value++ : a++
          return `${context.helperString(IS_REF)}(${raw})${
            context.isTS ? ' //@ts-ignore\n' : ''
          } ? ${prefix}${raw}.value${postfix} : ${prefix}${raw}${postfix}`
        } else if (isDestructureAssignment) {
          // 解构表达式处理
          // TODO
          // let binding in a destructure assignment - it's very tricky to
          // handle both possible cases here without altering the original
          // structure of the code, so we just assume it's not a ref here
          // for now
          return raw
        } else {
          return `${context.helperString(UNREF)}(${raw})`
        }
      } else if (type === BindingTypes.PROPS) {
        // use __props which is generated by compileScript so in ts mode
        // it gets correct type
        return `__props.${raw}`
      }
    } else {
      if (type && type.startsWith('setup')) {
        // setup bindings in non-inline mode
        return `$setup.${raw}`
      } else if (type) {
        return `$${type}.${raw}`
      }
    }

    // 回退到 ctx
    return `_ctx.${raw}`
  }

  // fast path if expression is a simple identifier.
  const rawExp = node.content
  // bail constant on parens (function invocation) and dot (member access)
  // 函数执行或成员点语法
  const bailConstant = rawExp.indexOf(`(`) > -1 || rawExp.indexOf('.') > 0

  if (isSimpleIdentifier(rawExp)) {
    const isScopeVarReference = context.identifiers[rawExp]
    // 全局对象和函数
    const isAllowedGlobal = isGloballyWhitelisted(rawExp)
    // true,false,null,this
    const isLiteral = isLiteralWhitelisted(rawExp)
    if (!asParams && !isScopeVarReference && !isAllowedGlobal && !isLiteral) {
      // const bindings exposed from setup can be skipped for patching but
      // cannot be hoisted to module scope
      if (bindingMetadata[node.content] === BindingTypes.SETUP_CONST) {
        node.constType = ConstantTypes.CAN_SKIP_PATCH
      }
      node.content = rewriteIdentifier(rawExp)
    } else if (!isScopeVarReference) {
      if (isLiteral) {
        node.constType = ConstantTypes.CAN_STRINGIFY
      } else {
        node.constType = ConstantTypes.CAN_HOIST
      }
    }
    return node
  }

  let ast: any
  // 表达式与 arg 解析不同点
  // 1. 多行语句(v-on, 含 `;`)：当做原生表达式处理
  // 2. 表达式：用括号包起来(比如：对象表达式)
  // 3. 函数参数(v-for, v-slot)：当做函数的参数
  // v-for: _renderList(list, (value, key, index) => ...)
  // v-slot: _createBlock(_component_Comp, null, { default: _withCtx((slotProps) => [ children... ]) })
  const source = asRawStatements
    ? ` ${rawExp} `
    : `(${rawExp})${asParams ? `=>{}` : ``}`

  try {
    ast = parse(source, {
      plugins: [...context.expressionPlugins, ...babelParserDefaultPlugins]
    }).program
  } catch (e) {
    context.onError(
      createCompilerError(
        ErrorCodes.X_INVALID_EXPRESSION,
        node.loc,
        undefined,
        e.message
      )
    )
    return node
  }

  const ids: (Identifier & PrefixMeta)[] = []
  const knownIds = Object.create(context.identifiers)
  const isDuplicate = (node: Node & PrefixMeta): boolean =>
    ids.some(id => id.start === node.start)
  const parentStack: Node[] = []

  // walk the AST and look for identifiers that need to be prefixed.
  // 遍历语法树，找出需要增加前缀的标识符
  ;(walk as any)(ast, {
    enter(node: Node & PrefixMeta, parent: Node | undefined) {
      parent && parentStack.push(parent)
      if (node.type === 'Identifier') {
        if (!isDuplicate(node)) {
          const needPrefix = shouldPrefix(node, parent!, parentStack)
          if (!knownIds[node.name] && needPrefix) {
            if (isStaticProperty(parent!) && parent.shorthand) {
              // 属性缩写，需要增加 key
              node.prefix = `${node.name}: `
            }
            node.name = rewriteIdentifier(node.name, parent, node)
            ids.push(node)
          } else if (!isStaticPropertyKey(node, parent!)) {
            // The identifier is considered constant unless it's pointing to a
            // scope variable (a v-for alias, or a v-slot prop)
            if (!(needPrefix && knownIds[node.name]) && !bailConstant) {
              node.isConstant = true
            }
            // also generate sub-expressions for other identifiers for better
            // source map support. (except for property keys which are static)
            ids.push(node)
          }
        }
      } else if (isFunction(node)) {
        // walk function expressions and add its arguments to known identifiers
        // so that we don't prefix them
        node.params.forEach(p =>
          (walk as any)(p, {
            enter(child: Node, parent: Node) {
              if (
                child.type === 'Identifier' &&
                !isStaticPropertyKey(child, parent) &&
                !(
                  parent &&
                  parent.type === 'AssignmentPattern' &&
                  parent.right === child
                )
              ) {
                const { name } = child
                if (node.scopeIds && node.scopeIds.has(name)) {
                  return
                }
                if (name in knownIds) {
                  knownIds[name]++
                } else {
                  knownIds[name] = 1
                }
                ;(node.scopeIds || (node.scopeIds = new Set())).add(name)
              }
            }
          })
        )
      }
    },
    leave(node: Node & PrefixMeta, parent: Node | undefined) {
      parent && parentStack.pop()
      if (node !== ast.body[0].expression && node.scopeIds) {
        node.scopeIds.forEach((id: string) => {
          knownIds[id]--
          if (knownIds[id] === 0) {
            delete knownIds[id]
          }
        })
      }
    }
  })

  // We break up the compound expression into an array of strings and sub
  // expressions (for identifiers that have been prefixed). In codegen, if
  // an ExpressionNode has the `.children` property, it will be used instead of
  // `.content`.
  const children: CompoundExpressionNode['children'] = []
  ids.sort((a, b) => a.start - b.start)
  ids.forEach((id, i) => {
    // range is offset by -1 due to the wrapping parens when parsed
    const start = id.start - 1
    const end = id.end - 1
    const last = ids[i - 1]
    const leadingText = rawExp.slice(last ? last.end - 1 : 0, start)

    if (leadingText.length || id.prefix) {
      children.push(leadingText + (id.prefix || ``))
    }

    const source = rawExp.slice(start, end)
    children.push(
      createSimpleExpression(
        id.name,
        false,
        {
          source,
          start: advancePositionWithClone(node.loc.start, source, start),
          end: advancePositionWithClone(node.loc.start, source, end)
        },
        id.isConstant ? ConstantTypes.CAN_STRINGIFY : ConstantTypes.NOT_CONSTANT
      )
    )

    if (i === ids.length - 1 && end < rawExp.length) {
      children.push(rawExp.slice(end))
    }
  })

  let ret
  if (children.length) {
    ret = createCompoundExpression(children, node.loc)
  } else {
    ret = node
    ret.constType = bailConstant
      ? ConstantTypes.NOT_CONSTANT
      : ConstantTypes.CAN_STRINGIFY
  }
  ret.identifiers = Object.keys(knownIds)
  return ret
}

const isFunction = (node: Node): node is Function => {
  return /Function(?:Expression|Declaration)$|Method$/.test(node.type)
}

const isStaticProperty = (node: Node): node is ObjectProperty =>
  node &&
  (node.type === 'ObjectProperty' || node.type === 'ObjectMethod') &&
  !node.computed

const isStaticPropertyKey = (node: Node, parent: Node) =>
  isStaticProperty(parent) && parent.key === node

function shouldPrefix(id: Identifier, parent: Node, parentStack: Node[]) {
  // declaration id
  if (
    (parent.type === 'VariableDeclarator' ||
      parent.type === 'ClassDeclaration') &&
    parent.id === id
  ) {
    return false
  }

  if (isFunction(parent)) {
    // function decalration/expression id
    if ((parent as any).id === id) {
      return false
    }
    // params list
    if (parent.params.includes(id)) {
      return false
    }
  }

  // property key
  // this also covers object destructure pattern
  if (isStaticPropertyKey(id, parent)) {
    return false
  }

  // non-assignment array destructure pattern
  if (
    parent.type === 'ArrayPattern' &&
    !isInDestructureAssignment(parent, parentStack)
  ) {
    return false
  }

  // member expression property
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    parent.property === id &&
    !parent.computed
  ) {
    return false
  }

  // is a special keyword but parsed as identifier
  if (id.name === 'arguments') {
    return false
  }

  // skip whitelisted globals
  if (isGloballyWhitelisted(id.name)) {
    return false
  }

  // special case for webpack compilation
  if (id.name === 'require') {
    return false
  }

  return true
}

function isInDestructureAssignment(parent: Node, parentStack: Node[]): boolean {
  if (
    parent &&
    (parent.type === 'ObjectProperty' || parent.type === 'ArrayPattern')
  ) {
    let i = parentStack.length
    while (i--) {
      const p = parentStack[i]
      if (p.type === 'AssignmentExpression') {
        return true
      } else if (p.type !== 'ObjectProperty' && !p.type.endsWith('Pattern')) {
        break
      }
    }
  }
  return false
}

function stringifyExpression(exp: ExpressionNode | string): string {
  if (isString(exp)) {
    return exp
  } else if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
    return exp.content
  } else {
    return (exp.children as (ExpressionNode | string)[])
      .map(stringifyExpression)
      .join('')
  }
}
