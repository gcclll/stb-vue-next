import MagicString from 'magic-string'
import { parse as _parse, ParserOptions, ParserPlugin } from '@babel/parser'
import {
  Identifier,
  ObjectExpression,
  Statement,
  TSFunctionType,
  TSTypeLiteral,
  TSUnionType,
  Node,
  ArrayExpression
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
      console.log(e)
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

  if (scriptSetup && scriptSetupLang !== 'ts') {
    // do not process non js/ts script blocks
    return scriptSetup
  }

  // TODO 1. 先处理存在的 <script> 代码体
  // process normal <script> first if it exists
  // TODO 2. 解析 <script setup>，遍历置顶的语句
  //
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

  return {} as SFCScriptBlock
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
