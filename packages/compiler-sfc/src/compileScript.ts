import MagicString from 'magic-string'
import { parse as _parse, ParserOptions, ParserPlugin } from '@babel/parser'
import {
  Expression,
  LabeledStatement,
  Identifier,
  ObjectExpression,
  Statement,
  TSFunctionType,
  TSTypeLiteral,
  TSUnionType,
  Node,
  ArrayExpression,
  ExportSpecifier,
  bindExpression,
  ObjectPattern,
  ArrayPattern
} from '@babel/types'
import { BindingMetadata, BindingTypes, UNREF } from '@vue/compiler-core'
import { babelParserDefaultPlugins, generateCodeFrame } from '@vue/shared'
import { SFCTemplateCompileOptions } from './compileTemplate'
import { SFCDescriptor, SFCScriptBlock } from './parse'
import { warnExperimental, warnOnce } from './warn'
import { RawSourceMap } from 'source-map'

export interface SFCScriptCompileOptions {
  /**
   * Scope ID for prefixing injected CSS varialbes.
   * This must be consistent with the `id` passed to `compileStyle`.
   */
  id: string
  /**
   * Production mode. Used to determine whether to generate hashed CSS variables
   */
  isProd?: boolean
  /**
   * https://babeljs.io/docs/en/babel-parser#plugins
   */
  babelParserPlugins?: ParserPlugin[]
  /**
   * Enable ref: label sugar
   * https://github.com/vuejs/rfcs/pull/228
   * @default true
   */
  refSugar?: boolean
  /**
   * Compile the template and inline the resulting render function
   * directly inside setup().
   * - Only affects <script setup>
   * - This should only be used in production because it prevents the template
   * from being hot-reloaded separately from component state.
   */
  inlineTemplate?: boolean
  templateOptions?: Partial<SFCTemplateCompileOptions>
}

/**
 * Compile `<script setup>`
 * It requires the whole SFC descriptor because we need to handle and merge
 * normal `<script>` + `<script setup>` if both are present.
 */
export function compileScript(
  sfc: SFCDescriptor,
  options: SFCScriptCompileOptions
): SFCScriptBlock {
  const { script, scriptSetup, source, filename } = sfc

  if (scriptSetup) {
    warnExperimental(`<script setup>`, 227)
  }

  // 向后兼容
  if (!options) {
    options = { id: '' }
  }

  if (!options.id) {
    warnOnce(
      `compileScript now requires passing the \`id\` option.\n` +
        `Upgrade your vite or vue-loader version for compatibility with ` +
        `the latest experimental proposals.`
    )
  }

  const scopeId = options.id ? options.id.replace(/^data-v-/, '') : ''
  const cssVars = sfc.cssVars
  const hasInheritAttrsFlag =
    sfc.template && sfc.template.attrs['inherit-attrs'] === 'false'
  const scriptLang = script && script.lang
  const scriptSetupLang = scriptSetup && scriptSetup.lang
  const isTS = scriptLang === 'ts' || scriptSetupLang === 'ts'
  const plugins: ParserPlugin[] = [...babelParserDefaultPlugins, 'jsx']
  if (options.babelParserPlugins) {
    plugins.push(...options.babelParserPlugins)
  }

  if (isTS) {
    plugins.push('typescript', 'decorators-legacy')
  }

  if (!scriptSetup) {
    if (!script) {
      throw new Error(`[@vue/compiler-sfc] SFC contains no <script> tags.`)
    }

    if (scriptLang && scriptLang !== 'ts') {
      // do not process non js/ts script blocks
      return script
    }

    try {
      const scriptAst = _parse(script.content, {
        plugins,
        sourceType: 'module'
      }).program.body
      const bindings = analyzeScriptBindings(scriptAst)
      const needRewrite = cssVars.length || hasInheritAttrsFlag
      let content = script.content
      if (needRewrite) {
        // TODO need rewrite
      }
      return {
        ...script,
        content,
        bindings,
        scriptAst
      }
    } catch (e) {
      // silently fallback if parse fails since user may be using custom
      // babel syntax
      return script
    }
  }

  // <script> 和 <script setup> 必须是同语言类型
  if (script && scriptLang !== scriptSetupLang) {
    throw new Error(
      `[@vue/compiler-sfc] <script> and <script setup> must have the same language type.`
    )
  }

  if (scriptSetupLang && scriptSetupLang !== 'ts') {
    // do not process non js/ts script blocks
    return scriptSetup
  }

  const defaultTempVar = `__default__`
  const helperImports: Set<string> = new Set()
  const userImports: Record<
    string,
    {
      isType: boolean
      imported: string
      source: string
    }
  > = Object.create(null)
  const userImportAlias: Record<string, string> = Object.create(null)
  const setupBindings: Record<string, BindingTypes> = Object.create(null)
  const refBindings: Record<string, BindingTypes> = Object.create(null)
  const refIdentifiers: Set<Identifier> = new Set()

  const enableRefSugar = options.refSugar !== false
  let defaultExport: Node | undefined

  const s = new MagicString(source)
  const startOffset = scriptSetup.loc.start.offset
  const endOffset = scriptSetup.loc.end.offset
  const scriptStartOffset = script && script.loc.start.offset
  const scriptEndOffset = script && script.loc.end.offset

  function helper(key: string): string {
    helperImports.add(key)
    return `_${key}`
  }

  function parse(
    input: string,
    options: ParserOptions,
    offset: number
  ): Statement[] {
    try {
      return _parse(input, options).program.body
    } catch (e) {
      e.message = `[@vue/compiler-sfc] ${e.message}\n\n${
        sfc.filename
      }\n${generateCodeFrame(source, e.pos + offset, e.pos + offset + 1)}`
      throw e
    }
  }

  function error(
    msg: string,
    node: Node,
    end: number = node.end! + startOffset
  ) {
    throw new Error(
      `[@vue/compiler-sfc] ${msg}\n\n${sfc.filename}\n${generateCodeFrame(
        source,
        node.start! + startOffset,
        end
      )}`
    )
  }

  function registerUserImport(
    source: string,
    local: string,
    imported: string | false,
    isType: boolean
  ) {
    if (source === 'vue' && imported) {
      userImportAlias[imported] = local
    }
    userImports[local] = {
      isType,
      imported: imported || 'default',
      source
    }
  }

  function processRefExpression(exp: Expression, statement: LabeledStatement) {
    // 必须是赋值语句, ref: num = 1
    if (exp.type === 'AssignmentExpression') {
      const { left, right } = exp
      if (left.type === 'Identifier') {
        registerRefBinding(left)
        s.prependRight(right.start! + startOffset, `${helper('ref')}(`)
        s.appendLeft(right.end! + startOffset, ')')
      } else if (left.type === 'ObjectPattern') {
        // 删除括号???
        for (let i = left.start!; i > 0; i--) {
          const char = source[i + startOffset]
          if (char === '(') {
            s.remove(i + startOffset, i + startOffset + 1)
            break
          }
        }
        for (let i = left.end!; i > 0; i++) {
          const char = source[i + startOffset]
          if (char === ')') {
            s.remove(i + startOffset, i + startOffset + 1)
            break
          }
        }
        processRefObjectPattern(left, statement)
      } else if (left.type === 'ArrayPattern') {
        // TODO
      }
    } else if (exp.type === 'SequenceExpression') {
      // 多条赋值语句情况, ref: x = 1, y = 2
      // TODO
    } else if (exp.type === 'Identifier') {
      // TODO
    } else {
      error(`ref: statements can only contain assignment expressions.`, exp)
    }
  }

  function registerRefBinding(id: Identifier) {
    if (id.name[0] === '$') {
      error(`ref variable identifiers cannot start with $.`, id)
    }
    refBindings[id.name] = setupBindings[id.name] = BindingTypes.SETUP_REF
    refIdentifiers.add(id)
  }

  function processRefObjectPattern(
    pattern: ObjectPattern,
    statement: LabeledStatement
  ) {
    // 解构语法： ref: ({ b = 1 } = { count: 0, b: 2 })
    // 生成： const { b = 1 } = { count 0, b: 2 }
    for (const p of pattern.properties) {
      let nameId: Identifier | undefined
      if (p.type === 'ObjectProperty') {
        if (p.key.start! === p.value.start!) {
          // 简写： { foo } -> { foo: __foo }
          nameId = p.key as Identifier
          s.appendLeft(nameId.end! + startOffset, `: __${nameId.name}`)

          // 左边有赋值语句，说明是解构后的默认值设置
          if (p.value.type === 'AssignmentPattern') {
            // { foo = 1 }
            refIdentifiers.add(p.value.left as Identifier)
          }
        } else {
          if (p.value.type === 'Identifier') {
            // 重命名 { foo: bar } --> { foo: __bar }
            nameId = p.value
            s.prependRight(nameId.start! + startOffset, `__`)
          } else if (p.value.type === 'ObjectPattern') {
            // 嵌套对象，解构
            processRefObjectPattern(p.value, statement)
          } else if (p.value.type === 'ArrayPattern') {
            processRefArrayPattern(p.value, statement)
          }
        }
      }
    }
  }

  function processRefArrayPattern(
    pattern: ArrayPattern,
    statement: LabeledStatement
  ) {
    for (const e of pattern.elements) {
      if (!e) continue
      let nameId: Identifier | undefined
      if (e.type === 'Identifier') {
        // [a] --> [__a]
        nameId = e
      } else if (e.type === 'AssignmentPattern') {
        // [a = 1] --> [__a = 1]
        nameId = e.left as Identifier
      } else if (e.type === 'ObjectPattern') {
        processRefObjectPattern(e, statement)
      } else if (e.type === 'ArrayPattern') {
        processRefArrayPattern(e, statement)
      }

      if (nameId) {
        registerRefBinding(nameId)
        // prefix original
        s.prependRight(nameId.start! + startOffset, `__`)
        // append binding declarations after the parent statement
        s.appendLeft(
          statement.end! + startOffset,
          `\nconst ${nameId.name} = ${helper('ref')}(__${nameId.name});`
        )
      }
    }
  }

  // 能到这里说明至少有一个 <script setup>
  // 1. 先处理存在的 <script> 代码体
  // process normal <script> first if it exists
  let scriptAst
  if (script) {
    // import dedupe between <script> and <script setup>
    scriptAst = parse(
      script.content,
      {
        plugins,
        sourceType: 'module'
      },
      scriptStartOffset!
    )

    for (const node of scriptAst) {
      // import ... from '...'
      if (node.type === 'ImportDeclaration') {
        // record imports for dedupe
        for (const specifier of node.specifiers) {
          const imported =
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name
          registerUserImport(
            node.source.value,
            specifier.local.name,
            imported,
            node.importKind === 'type'
          )
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        // export default
        defaultExport = node
        const start = node.start! + scriptStartOffset!
        s.overwrite(
          start,
          start + `export default`.length,
          `const ${defaultTempVar} =`
        )
      } else if (node.type === 'ExportNamedDeclaration' && node.specifiers) {
        const defaultSpecifier = node.specifiers.find(
          s => s.exported.type === 'Identifier' && s.exported.name === 'default'
        ) as ExportSpecifier
        if (defaultSpecifier) {
          defaultExport = node
          // 1. remove specifier
          if (node.specifiers.length > 1) {
            s.remove(
              defaultSpecifier.start! + scriptStartOffset!,
              defaultSpecifier.end! + scriptStartOffset!
            )
          } else {
            s.remove(
              node.start! + scriptStartOffset!,
              node.end! + scriptStartOffset!
            )
          }

          if (node.source) {
            // export { x as default } from './x'
            // 重写成 rewrite to `import { x as __default } from './x'
            // 然后添加到顶部
            s.prepend(
              `import { ${
                defaultSpecifier.local.name
              } as ${defaultTempVar} } from '${node.source.value}'\n`
            )
          } else {
            // export { x as default }
            // 重写成 `const __default__ = x` 且移到最后
            s.append(
              `\nconst ${defaultTempVar} = ${defaultSpecifier.local.name}\n`
            )
          }
        }
      }
    }
  }
  // TODO 2. 解析 <script setup>，遍历置顶的语句
  const scriptSetupAst = parse(
    scriptSetup.content,
    {
      plugins: [
        ...plugins,
        // allow top level await but only inside <script setup>
        'topLevelAwait'
      ],
      sourceType: 'module'
    },
    startOffset
  )

  for (const node of scriptSetupAst) {
    const start = node.start! + startOffset
    let end = node.end! + startOffset

    // import or type declarations: move to top
    // locate comment
    // import 或类型声明：移到顶部
    if (node.trailingComments && node.trailingComments.length > 0) {
      const lastCommentNode =
        node.trailingComments[node.trailingComments.length - 1]
      end = lastCommentNode.end + startOffset
    }

    // locate the end of whitespace between this statement and the next
    while (end <= source.length) {
      if (!/\s/.test(source.charAt(end))) {
        break
      }
      end++
    }

    console.log(`---- before ----`)
    console.log(s.toString())
    // 处理 `ref: x` 绑定，转成 refs
    if (
      node.type === 'LabeledStatement' &&
      node.label.name === 'ref' &&
      node.body.type === 'ExpressionStatement'
    ) {
      // 必须要开启 ref 功能
      if (enableRefSugar) {
        warnExperimental(`ref: sugar`, 228)
        s.overwrite(
          node.label.start! + startOffset,
          node.body.start! + startOffset,
          'const '
        )
        processRefExpression(node.body.expression, node)
      } else {
        // TODO if we end up shipping ref: sugar as an opt-in feature,
        // need to proxy the option in vite, vue-loader and rollup-plugin-vue.
        error(
          `ref: sugar needs to be explicitly enabled via vite or vue-loader options.`,
          node
        )
      }
    }
    console.log(`---- after ----`)
    console.log(s.toString())
  }
  // TODO 3. 将 ref访问转换成对 ref.value 的引用
  //
  // TODO 4. 释放 setup 上下文类型的运行时 props/emits 代码
  //
  // TODO 5. 检查用户选项(useOptions)参数，确保它没有引用 setup 下的变量
  //
  // TODO 6. 删除 non-script 的内容
  //
  // TODO 7. 分析 binding metadata
  //
  // TODO 8. 注入 `useCssVars` 调用
  //
  // TODO 9. 完成 setup() 参数签名
  //
  // TODO 10. 生成返回语句(return)
  //
  // TODO 11. 完成 default export
  // expose: [] makes <script setup> components "closed" by default.
  //
  // TODO 12. 完成 Vue helpers imports

  s.trim()
  return {
    ...scriptSetup,
    bindings: {},
    content: s.toString()
  }
}

interface PropTypeData {
  key: string
  type: string[]
  required: boolean
}

/**
 * Analyze bindings in normal `<script>`
 * Note that `compileScriptSetup` already analyzes bindings as part of its
 * compilation process so this should only be used on single `<script>` SFCs.
 */
function analyzeScriptBindings(ast: Statement[]): BindingMetadata {
  for (const node of ast) {
    if (
      node.type === 'ExportDefaultDeclaration' &&
      node.declaration.type === 'ObjectExpression'
    ) {
      return analyzeBindingsFromOptions(node.declaration)
    }
  }
  return {}
}

function analyzeBindingsFromOptions(node: ObjectExpression): BindingMetadata {
  const bindings: BindingMetadata = {}
  for (const property of node.properties) {
    if (
      property.type === 'ObjectProperty' &&
      !property.computed &&
      property.key.type === 'Identifier'
    ) {
      // props
      if (property.key.name === 'props') {
        // props: ['foo']
        // props: { foo: ... }
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.PROPS
        }
      } else if (property.key.name === 'inject') {
        // inject: ['foo']
        // inject: { foo: {} }
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }
      // computed & methods
      else if (
        property.value.type === 'ObjectExpression' &&
        (property.key.name === 'computed' || property.key.name === 'methods')
      ) {
        // methods: { foo() {} }
        // computed: { foo() {} }
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }
    } else if (
      property.type === 'ObjectMethod' &&
      property.key.type === 'Identifier' &&
      (property.key.name === 'setup' || property.key.name === 'data')
    ) {
      for (const bodyItem of property.body.body) {
        // setup() {
        //   return {
        //     foo: null
        //   }
        // }
        if (
          bodyItem.type === 'ReturnStatement' &&
          bodyItem.argument &&
          bodyItem.argument.type === 'ObjectExpression'
        ) {
          for (const key of getObjectExpressionKeys(bodyItem.argument)) {
            bindings[key] = property.key.name = 'setup'
              ? BindingTypes.SETUP_MAYBE_REF
              : BindingTypes.DATA
          }
        }
      }
    }
  }

  return bindings
}

function getObjectExpressionKeys(node: ObjectExpression): string[] {
  const keys = []
  for (const prop of node.properties) {
    if (
      (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
      !prop.computed
    ) {
      if (prop.key.type === 'Identifier') {
        keys.push(prop.key.name)
      } else if (prop.key.type === 'StringLiteral') {
        keys.push(prop.key.value)
      }
    }
  }
  return keys
}

function getArrayExpressionKeys(node: ArrayExpression): string[] {
  const keys = []
  for (const element of node.elements) {
    if (element && element.type === 'StringLiteral') {
      keys.push(element.value)
    }
  }
  return keys
}

// 这个函数说白了就行是收集所有属性名
function getObjectOrArrayExpressionKeys(value: Node): string[] {
  if (value.type === 'ArrayExpression') {
    return getArrayExpressionKeys(value)
  }

  if (value.type) {
    return getObjectExpressionKeys(value)
  }
  return []
}
