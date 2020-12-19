import {
  CodegenResult,
  CompilerError,
  CompilerOptions,
  ParserOptions,
  RootNode
} from '@vue/compiler-core'
import { RawSourceMap } from 'source-map'
import { AssetURLOptions, AssetURLTagConfig } from './templateTransformAssetUrl'

export interface TemplateCompiler {
  compile(template: string, options: CompilerOptions): CodegenResult
  parse(template: string, options: ParserOptions): RootNode
}

export interface SFCTemplateCompileResults {
  code: string
  ast?: RootNode
  preamble?: string
  source: string
  tips: string[]
  errors: (string | CompilerError)[]
  map?: RawSourceMap
}

export interface SFCTemplateCompileOptions {
  source: string
  filename: string
  id: string
  scoped?: boolean
  isProd?: boolean
  ssr?: boolean
  ssrCssVars?: string[]
  inMap?: RawSourceMap
  compiler?: TemplateCompiler
  compilerOptions?: CompilerOptions
  preprocessLang?: string
  preprocessOptions?: any
  /**
   * In some cases, compiler-sfc may not be inside the project root (e.g. when
   * linked or globally installed). In such cases a custom `require` can be
   * passed to correctly resolve the preprocessors.
   */
  preprocessCustomRequire?: (id: string) => any
  /**
   * Configure what tags/attributes to transform into asset url imports,
   * or disable the transform altogether with `false`.
   */
  transformAssetUrls?: AssetURLOptions | AssetURLTagConfig | boolean
}

export function compileTemplate(
  options: SFCTemplateCompileOptions
): SFCTemplateCompileResults {
  return {} as SFCTemplateCompileResults
}
