import MagicString from 'magic-string'
import { parse as _parse, ParserPlugin } from '@babel/parser'
import {
  Identifier,
  TSFunctionType,
  TSTypeLiteral,
  TSUnionType
} from '@babel/types'
import { BindingMetadata, BindingTypes } from '@vue/compiler-dom'
import { babelParserDefaultPlugins } from '@vue/shared'
import { SFCTemplateCompileOptions } from './compileTemplate'
import { SFCDescriptor, SFCScriptBlock } from './parse'
import { warnExperimental, warnOnce } from './warn'

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
      // TODO
    } catch (e) {
      // silently fallback if parse fails since user may be using custom
      // babel syntax
      return script
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

    const defaultTempVar = `__default__`
    const bindingMetadata: BindingMetadata = {}
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
    let hasDefinePropsCall = false
    let hasDefineEmitCall = false
    let propsRuntimeDecl: Node | undefined
    let propsTypeDecl: TSTypeLiteral | undefined
    let propsIdentifier: string | undefined
    let emitRuntimeDecl: Node | undefined
    let emitTypeDecl: TSFunctionType | TSUnionType | undefined
    let emitIdentifier: string | undefined
    let hasAwait = false
    let hasInlinedSsrRenderFn = false
    // props/emits declared via types
    const typeDeclaredProps: Record<string, PropTypeData> = {}
    const typeDeclaredEmits: Set<string> = new Set()
    // record declared types for runtime props type generation
    const declaredTypes: Record<string, string[]> = {}

    // magic-string state
    const s = new MagicString(source)
    const startOffset = scriptSetup.loc.start.offset
    const endOffset = scriptSetup.loc.end.offset
    const scriptStartOffset = script && script.loc.start.offset
    const scriptEndOffset = script && script.loc.end.offset
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
