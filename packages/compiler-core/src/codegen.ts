import { RawSourceMap, SourceMapGenerator } from 'source-map'
import { JSChildNode, RootNode, SSRCodegenNode, TemplateChildNode } from './ast'
import { CodegenOptions } from './options'

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

export function generate(
  ast: RootNode,
  options: CodegenOptions & {
    onContextCreated?: (context: CodegenContext) => void
  } = {}
): CodegenResult {
  return ast as any
}
