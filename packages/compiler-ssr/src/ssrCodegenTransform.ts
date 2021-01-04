import {
  BlockStatement,
  CallExpression,
  CompilerOptions,
  createBlockStatement,
  createCompoundExpression,
  createRoot,
  createSimpleExpression,
  createTransformContext,
  IfStatement,
  isText,
  NodeTypes,
  processExpression,
  RootNode,
  TemplateChildNode,
  TemplateLiteral
} from '@vue/compiler-dom'
import { escapeHtml } from '@vue/shared'
import { ssrHelpers } from './runtimeHelpers'

// Because SSR codegen output is completely different from client-side output
// (e.g. multiple elements can be concatenated into a single template literal
// instead of each getting a corresponding call), we need to apply an extra
// transform pass to convert the template AST into a fresh JS AST before
// passing it to codegen.

export function ssrCodegenTransform(ast: RootNode, options: CompilerOptions) {
  // ssr transform 上下文对象
  const context = createSSRTransformContext(ast, options)

  // 注入 SFC <style> CSS 变量
  // 确保在每次渲染的时候内联表达式只会被解析一次
  if (options.ssrCssVars) {
    // ssr css 变量处理
    const varsExp = processExpression(
      createSimpleExpression(options.ssrCssVars, false),
      createTransformContext(createRoot([]), options)
    )
    context.body.push(
      createCompoundExpression([`const _cssVars = { style: `, varsExp, `}`])
    )
  }

  // 多个孩子节点，且至少有一个不是文本节点
  const isFragment =
    ast.children.length > 1 && ast.children.some(c => !isText(c))
  processChildren(ast.children, context, isFragment)
  ast.codegenNode = createBlockStatement(context.body)

  // Finalize helpers.
  // We need to separate helpers imported from 'vue' vs. '@vue/server-renderer'
  ast.ssrHelpers = [
    ...ast.helpers.filter(h => h in ssrHelpers),
    ...context.helpers
  ]
  ast.helpers = ast.helpers.filter(h => !(h in ssrHelpers))
}

export type SSRTransformContext = ReturnType<typeof createSSRTransformContext>

function createSSRTransformContext(
  root: RootNode,
  options: CompilerOptions,
  helpers: Set<symbol> = new Set(),
  withSlotScopeId = false
) {
  const body: BlockStatement['body'] = []
  let currentString: TemplateLiteral | null = null

  return {
    root,
    options,
    body,
    helpers,
    withSlotScopeId,
    onError:
      options.onError ||
      (e => {
        throw e
      }),
    helper<T extends symbol>(name: T): T {
      helpers.add(name)
      return name
    },
    pushStringPart(part: TemplateLiteral['elements'][0]) {
      // TODO
    },
    pushStatement(statement: IfStatement | CallExpression) {
      // close current string
      currentString = null
      body.push(statement)
    }
  }
}

function createChildContext(
  parent: SSRTransformContext,
  withSlotScopeId = parent.withSlotScopeId
): SSRTransformContext {
  // ensure child inherits parent helpers
  // 孩子继承父级的 helpers
  return createSSRTransformContext(
    parent.root,
    parent.options,
    parent.helpers,
    withSlotScopeId
  )
}

export function processChildren(
  children: TemplateChildNode[],
  context: SSRTransformContext,
  asFragment = false,
  disableNestedFragments = false
) {
  if (asFragment) {
    context.pushStringPart(`<!--[-->`)
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    switch (child.type) {
      case NodeTypes.TEXT:
        context.pushStringPart(escapeHtml(child.content))
        break
    }
  }
}
