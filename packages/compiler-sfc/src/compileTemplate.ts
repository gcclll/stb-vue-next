import {
  CodegenResult,
  CompilerOptions,
  ParserOptions,
  RootNode
} from '@vue/compiler-core'

export interface TemplateCompiler {
  compile(template: string, options: CompilerOptions): CodegenResult
  parse(template: string, options: ParserOptions): RootNode
}
