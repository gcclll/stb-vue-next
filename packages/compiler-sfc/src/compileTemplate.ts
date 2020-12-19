import {
  CodegenResult,
  CompilerError,
  CompilerOptions,
  ParserOptions,
  RootNode
} from '@vue/compiler-core'
import { RawSourceMap } from 'source-map'
import * as CompilerDOM from '@vue/compiler-dom'
import { AssetURLOptions, AssetURLTagConfig } from './templateTransformAssetUrl'
import consolidate from 'consolidate'

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
  const { preprocessLang, preprocessCustomRequire } = options

  // 浏览器 <script type="module"> 检测
  if (
    (__ESM_BROWSER__ || __GLOBAL__) &&
    preprocessLang &&
    !preprocessCustomRequire
  ) {
    throw new Error(
      `[@vue/compiler-sfc] Template preprocessing in the browser build must ` +
        `provide the \`preprocessCustomRequire\` option to return the in-browser ` +
        `version of the preprocessor in the shape of { render(): string }.`
    )
  }

  // 预处理器？
  const preprocessor = preprocessLang
    ? preprocessCustomRequire
      ? preprocessCustomRequire(preprocessLang)
      : require('consolidate')[preprocessLang as keyof typeof consolidate]
    : false

  if (preprocessor) {
    try {
      return doCompileTemplate({
        ...options,
        source: preprocess(options, preprocessor)
      })
    } catch (e) {
      return {
        code: `export default function render() {}`,
        source: options.source,
        tips: [],
        errors: [e]
      }
    }
  } else if (preprocessLang) {
    return {
      code: `export default function render() {}`,
      source: options.source,
      tips: [
        `Component ${
          options.filename
        } uses lang ${preprocessLang} fro template. Please install the language preprocessor.`
      ],
      errors: [
        `Component ${
          options.filename
        } uses lang ${preprocessLang} for template, however it is not installed.`
      ]
    }
  } else {
    return doCompileTemplate(options)
  }
}

function doCompileTemplate({
  filename,
  id,
  scoped,
  inMap,
  source,
  ssr = false,
  ssrCssVars,
  isProd = false,
  compiler = ssr
    ? ({
        /* TODO */
      } as TemplateCompiler)
    : CompilerDOM,
  compilerOptions = {},
  transformAssetUrls
}: SFCTemplateCompileOptions): SFCTemplateCompileResults {
  return {} as SFCTemplateCompileResults
}
