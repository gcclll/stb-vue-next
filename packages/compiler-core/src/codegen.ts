import { isString, isSymbol } from '@vue/shared'
import { RawSourceMap, SourceMapGenerator } from 'source-map'
import {
  JSChildNode,
  NodeTypes,
  RootNode,
  SimpleExpressionNode,
  SSRCodegenNode,
  TemplateChildNode,
  TextNode
} from './ast'
import { CodegenOptions } from './options'
import {
  helperNameMap,
  POP_SCOPE_ID,
  PUSH_SCOPE_ID,
  WITH_SCOPE_ID
} from './runtimeHelpers'

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
  const { push, newline } = context

  // Generate const declaration for helpers
  // In prefix mode, we place the const declaration at top so it's done
  // only once; But if we not prefixing, we place the declaration inside the
  // with block so it doesn't incur the `in` check cost for every helper access.
  if (ast.helpers.length > 0) {
    // TODO
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
    case NodeTypes.TEXT:
      genText(node, context)
      break
  }
}

function genText(
  node: TextNode | SimpleExpressionNode,
  context: CodegenContext
) {
  context.push(JSON.stringify(node.content), node)
}
