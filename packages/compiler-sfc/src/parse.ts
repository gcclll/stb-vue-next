import { Statement } from '@babel/types'
import {
  BindingMetadata,
  CompilerError,
  ElementNode,
  SourceLocation
} from '@vue/compiler-core'
import { RawSourceMap } from 'source-map'
import { TemplateCompiler } from './compileTemplate'

export interface SFCParseOptions {
  filename?: string
  sourceMap?: boolean
  sourceRoot?: string
  pad?: boolean | 'line' | 'space'
  compiler?: TemplateCompiler
}

export interface SFCBlock {
  type: string
  content: string
  attrs: Record<string, string | true>
  loc: SourceLocation
  map?: RawSourceMap
  lang?: string
  src?: string
}

export interface SFCTemplateBlock extends SFCBlock {
  type: 'template'
  ast: ElementNode
}

export interface SFCScriptBlock extends SFCBlock {
  type: 'script'
  setup?: string | boolean
  bindings?: BindingMetadata
  scriptAst?: Statement[]
  scriptSetupAst?: Statement[]
}

export interface SFCStyleBlock extends SFCBlock {
  type: 'style'
  scoped?: boolean
  module?: string | boolean
}

export interface SFCDescriptor {
  filename: string
  source: string
  template: SFCTemplateBlock | null
  script: SFCScriptBlock | null
  scriptSetup: SFCScriptBlock | null
  styles: SFCStyleBlock[]
  customBlocks: SFCBlock[]
  cssVars: string[]
}

export interface SFCParseResult {
  descriptor: SFCDescriptor
  errors: (CompilerError | SyntaxError)[]
}
export function parse(
  source: string,
  { sourceMap = true }: SFCParseOptions
): SFCParseResult {
  return {} as SFCParseResult
}
