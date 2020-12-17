import {
  baseCompile,
  baseParse,
  CompilerOptions,
  CodegenResult,
  ParserOptions,
  RootNode,
  NodeTransform
} from '@vue/compiler-core'
import { extend } from '@vue/shared'
import { transformStyle } from './transforms/transformStyle'
import { parserOptions } from './parserOptions'
import { stringifyStatic } from './transforms/stringifyStatic'

export { parserOptions }

export const DOMNodeTransforms: NodeTransform[] = [transformStyle]

export function compile(
  template: string,
  options: CompilerOptions
): CodegenResult {
  return baseCompile(
    template,
    extend({}, parserOptions, {
      nodeTransforms: [...DOMNodeTransforms],
      directiveTransforms: extend({}),
      // 静态提升 transform
      transformHoist: __BROWSER__ ? null : stringifyStatic
    })
  )
}

export function parse(template: string, options: ParserOptions = {}): RootNode {
  return baseParse(template, extend({}, parserOptions, options))
}

export * from '@vue/compiler-core'
