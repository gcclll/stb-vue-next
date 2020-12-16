import {
  baseCompile,
  baseParse,
  CompilerOptions,
  CodegenResult,
  ParserOptions,
  RootNode
} from '@vue/compiler-core'
import { extend } from '@vue/shared'
import { parserOptions } from './parserOptions'
import { stringifyStatic } from './transforms/stringifyStatic'

export { parserOptions }

export function compile(
  template: string,
  options: CompilerOptions
): CodegenResult {
  return baseCompile(
    template,
    extend({}, parserOptions, {
      nodeTransforms: [],
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
