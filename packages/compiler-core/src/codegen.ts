import { isString, isSymbol, isArray } from '@vue/shared'
import { RawSourceMap, SourceMapGenerator } from 'source-map'
import {
  CallExpression,
  CommentNode,
  InterpolationNode,
  JSChildNode,
  NodeTypes,
  RootNode,
  SimpleExpressionNode,
  SSRCodegenNode,
  TemplateChildNode,
  TextNode,
  VNodeCall
} from './ast'
import { CodegenOptions } from './options'
import {
  CREATE_BLOCK,
  CREATE_COMMENT,
  CREATE_VNODE,
  helperNameMap,
  OPEN_BLOCK,
  POP_SCOPE_ID,
  PUSH_SCOPE_ID,
  TO_DISPLAY_STRING,
  WITH_DIRECTIVES,
  WITH_SCOPE_ID
} from './runtimeHelpers'
import { assert } from './utils'

const PURE_ANNOTATION = `/*#__PURE__*/`

type CodegenNode = TemplateChildNode | JSChildNode | SSRCodegenNode

export interface CodegenResult {
  code: string
  ast: RootNode
  map?: RawSourceMap
}

export interface CodegenContext
  extends Omit<Required<CodegenOptions>, 'bindingMetadata'> {
  source: string
  code: string
  line: number
  column: number
  offset: number
  indentLevel: number
  pure: boolean
  map?: SourceMapGenerator
  helper(key: symbol): string
  push(code: string, node?: CodegenNode): void
  indent(): void
  deindent(withoutNewLine?: boolean): void
  newline(): void
}

function createCodegenContext(
  ast: RootNode,
  {
    mode = 'function',
    prefixIdentifiers = mode === 'module',
    sourceMap = false,
    filename = `template.vue.html`,
    scopeId = null,
    optimizeImports = false,
    runtimeGlobalName = `Vue`,
    runtimeModuleName = `vue`,
    ssr = false
  }: CodegenOptions
): CodegenContext {
  const context: CodegenContext = {
    mode,
    prefixIdentifiers,
    sourceMap,
    filename,
    scopeId,
    optimizeImports,
    runtimeGlobalName,
    runtimeModuleName,
    ssr,
    source: ast.loc.source,
    code: ``,
    column: 1,
    line: 1,
    offset: 0,
    indentLevel: 0,
    pure: false,
    map: undefined,
    helper(key) {
      return `_${helperNameMap[key]}`
    },
    push(code, node) {
      context.code += code
      if (!__BROWSER__ && context.map) {
        // TODO 非浏览器环境增加 map 代码位置映射关系
      }
    },
    indent() {
      newline(++context.indentLevel)
    },
    deindent(withoutNewLine = false) {
      if (withoutNewLine) {
        --context.indentLevel
      } else {
        newline(--context.indentLevel)
      }
    },
    newline() {
      newline(context.indentLevel)
    }
  }

  function newline(n: number) {
    context.push('\n' + `  `.repeat(n))
  }

  if (!__BROWSER__ && sourceMap) {
    // lazy require source-map implementation, only in non-browser builds
    context.map = new SourceMapGenerator()
    context.map!.setSourceContent(filename, context.source)
  }

  return context
}

export function generate(
  ast: RootNode,
  options: CodegenOptions & {
    onContextCreated?: (context: CodegenContext) => void
  } = {}
): CodegenResult {
  const context = createCodegenContext(ast, options)
  // 上下文创建结束的钩子函数
  if (options.onContextCreated) {
    options.onContextCreated(context)
  }

  const {
    prefixIdentifiers,
    scopeId,
    push,
    ssr,
    mode,
    indent,
    deindent,
    newline
  } = context

  const hasHelpers = ast.helpers.length > 0
  const useWithBlock = !prefixIdentifiers && mode !== 'module'
  const genScopeId = !__BROWSER__ && scopeId != null && mode === 'module'

  if (!__BROWSER__ && mode === 'module') {
    genModulePreamble(ast, context, genScopeId)
  } else {
    // -> `function ...`
    genFunctionPreamble(ast, context)
  }

  const optimizeSources = options.bindingMetadata
    ? `, $props, $setup, $data, $options`
    : ``

  if (!ssr) {
    if (genScopeId) {
      push(`const render = ${PURE_ANNOTATION}_withId(`)
    }
    push(`function render(_ctx, _cache${optimizeSources}) {`)
  } else {
    // TODO ssr
  }
  indent()

  if (useWithBlock) {
    push(`with (_ctx) {`)
    indent()
    // function mode const declarations should be inside with block
    // also they should be renamed to avoid collision with user properties
    // 重命名引入的函数避免冲突
    if (hasHelpers) {
      push(
        `const { ${ast.helpers
          .map(s => `${helperNameMap[s]} : _${helperNameMap[s]}`)
          .join(', ')} } = _Vue`
      )
      push(`\n`)
      newline()
    }
  }

  // TODO ast.components, generate asset resolution statements

  // TODO generate directives, ast.directives

  // TODO 临时变量 ast.temps

  // 生成 VNode 树表达式
  if (!ssr) {
    // 这里是真正 render 函数核心，上面都是为了引入变量，函数，imports 等做的处理
    push(`return `)
  }

  if (ast.codegenNode) {
    // genNode 为 codegen 阶段最最最核心函数
    genNode(ast.codegenNode, context)
  } else {
    push(`null`)
  }

  if (useWithBlock) {
    deindent()
    push(`}`)
  }

  deindent()
  push(`}`)

  if (genScopeId) {
    push(`)`)
  }
  return {
    ast,
    code: context.code,
    map: context.map ? (context.map as any).toJSON() : undefined
  }
}

function genFunctionPreamble(ast: RootNode, context: CodegenContext) {
  const { push, newline, runtimeGlobalName, prefixIdentifiers, ssr } = context

  const VueBinding = !__BROWSER__ && ssr ? `` : runtimeGlobalName

  const aliasHelper = (s: symbol) => `${helperNameMap[s]}: _${helperNameMap[s]}`

  // Generate const declaration for helpers
  // In prefix mode, we place the const declaration at top so it's done
  // only once; But if we not prefixing, we place the declaration inside the
  // with block so it doesn't incur the `in` check cost for every helper access.
  if (ast.helpers.length > 0) {
    if (!__BROWSER__ && prefixIdentifiers) {
      push(
        `const { ${ast.helpers.map(aliasHelper).join(', ')} } = ${VueBinding}\n`
      )
    } else {
      // "with" mode.
      // save Vue in a separate variable to avoid collision
      push(`const _Vue = ${VueBinding}\n`)
      // in "with" mode, helpers are declared inside the with block to avoid
      // has check cost, but hoists are lifted out of the function - we need
      // to provide the helper here.
      // TODO
    }
  }

  // ssr helpers
  if (!__BROWSER__ && ast.ssrHelpers && ast.ssrHelpers.length) {
    // TODO
  }

  // TODO gen hoists 静态提升
  newline()
  push(`return `)
}

// TODO
function genModulePreamble(
  ast: RootNode,
  context: CodegenContext,
  genScopeId: boolean
) {
  const { push, helper, newline, scopeId } = context

  if (genScopeId) {
    ast.helpers.push(WITH_SCOPE_ID)
    if (ast.hoists.length) {
      ast.helpers.push(PUSH_SCOPE_ID, POP_SCOPE_ID)
    }
  }

  // 为所有的 helpers 生成 import 语句
  if (ast.helpers.length) {
    // TODO helpers
  }

  // 服务端渲染 helpers import 语法
  if (ast.ssrHelpers && ast.ssrHelpers.length) {
    // TODO ssr helpers
  }

  if (ast.imports.length) {
    // TODO imports
  }

  if (genScopeId) {
    push(
      `const _withId = ${PURE_ANNOTATION}${helper(WITH_SCOPE_ID)}("${scopeId}")`
    )
    newline()
  }

  // TODO gen hoists
  newline()
  push(`export `)
}

function isText(n: string | CodegenNode) {
  return (
    isString(n) ||
    n.type === NodeTypes.SIMPLE_EXPRESSION ||
    n.type === NodeTypes.TEXT ||
    n.type === NodeTypes.INTERPOLATION ||
    n.type === NodeTypes.COMPOUND_EXPRESSION
  )
}

function genNodeListAsArray(
  nodes: (string | CodegenNode | TemplateChildNode[])[],
  context: CodegenContext
) {
  const multilines =
    nodes.length > 3 ||
    ((!__BROWSER__ || __DEV__) && nodes.some(n => isArray(n) || !isText(n)))

  context.push(`[`)
  multilines && context.indent()
  genNodeList(nodes, context, multilines)
  multilines && context.deindent()
  context.push(']')
}

// nodes: 对应 [tag, props, children, patchFlag, dynamicProps]
// 遍历递归处理这些节点
function genNodeList(
  nodes: (string | symbol | CodegenNode | TemplateChildNode)[],
  context: CodegenContext,
  multilines: boolean = false,
  comma: boolean = true
) {
  const { push, newline } = context
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (isString(node)) {
      // 节点是字符串，直接 code += node
      push(node)
    } else if (isArray(node)) {
      // 将节点生成数组类型
      genNodeListAsArray(node, context)
    } else {
      genNode(node, context)
    }

    if (i < nodes.length - 1) {
      // 最后一个不用加逗号
      if (multilines) {
        comma && push(', ')
        newline()
      } else {
        comma && push(',')
      }
    }
  }
}

function genNode(node: CodegenNode | symbol | string, context: CodegenContext) {
  if (isString(node)) {
    // 节点是字符串，直接 code += node
    context.push(node)
    return
  }

  if (isSymbol(node)) {
    context.push(context.helper(node))
    return
  }

  switch (node.type) {
    case NodeTypes.ELEMENT:
      __DEV__ &&
        assert(
          node.codegenNode != null,
          `Codegen node is missing for element/if/for node. ` +
            `Apply appropriate transforms first.`
        )
      genNode(node.codegenNode!, context)
      break
    case NodeTypes.TEXT:
      genText(node, context)
      break
    case NodeTypes.SIMPLE_EXPRESSION:
      genExpression(node, context)
      break
    case NodeTypes.INTERPOLATION:
      genInterpolation(node, context)
      break
    case NodeTypes.COMMENT:
      genComment(node, context)
      break
    case NodeTypes.VNODE_CALL:
      genVNodeCall(node, context)
      break
  }
}

function genText(
  node: TextNode | SimpleExpressionNode,
  context: CodegenContext
) {
  context.push(JSON.stringify(node.content), node)
}

function genExpression(node: SimpleExpressionNode, context: CodegenContext) {
  const { content, isStatic } = node
  context.push(isStatic ? JSON.stringify(content) : content, node)
}

function genInterpolation(node: InterpolationNode, context: CodegenContext) {
  const { push, helper, pure } = context
  if (pure) push(PURE_ANNOTATION)
  push(`${helper(TO_DISPLAY_STRING)}(`)
  genNode(node.content, context)
  push(')')
}

function genComment(node: CommentNode, context: CodegenContext) {
  if (__DEV__) {
    const { push, helper, pure } = context
    if (pure) {
      push(PURE_ANNOTATION)
    }
    push(`${helper(CREATE_COMMENT)}(${JSON.stringify(node.content)})`, node)
  }
}

function genVNodeCall(node: VNodeCall, context: CodegenContext) {
  const { push, helper, pure } = context
  const {
    tag,
    props,
    children,
    patchFlag,
    dynamicProps,
    directives,
    isBlock,
    disableTracking
  } = node

  if (directives) {
    push(helper(WITH_DIRECTIVES) + `(`)
  }

  if (isBlock) {
    push(`(${helper(OPEN_BLOCK)}(${disableTracking ? `true` : ``}), `)
  }

  if (pure) {
    push(PURE_ANNOTATION)
  }

  push(helper(isBlock ? CREATE_BLOCK : CREATE_VNODE) + '(', node)
  genNodeList(
    // 过滤掉空值
    genNullableArgs([tag, props, children, patchFlag, dynamicProps]),
    context
  )

  push(`)`)
  if (isBlock) {
    push(`)`)
  }

  if (directives) {
    push(`, `)
    genNode(directives, context)
    push(`)`)
  }
}

function genNullableArgs(args: any[]): CallExpression['arguments'] {
  let i = args.length
  // 从末尾开始淘汰掉空值参数
  while (i--) {
    if (args[i] != null) break
  }

  return args.slice(0, i + 1).map(arg => arg || `null`)
}
