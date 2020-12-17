import {
  baseCompile,
  baseParse,
  CompilerOptions,
  CodegenResult,
  ParserOptions,
  RootNode,
  NodeTransform,
  DirectiveTransform
} from '@vue/compiler-core'
import { extend } from '@vue/shared'
import { transformStyle } from './transforms/transformStyle'
import { transformVHtml } from './transforms/vHtml'
import { transformVText } from './transforms/vText'
import { transformModel } from './transforms/vModel'
import { transformOn } from './transforms/vOn'
import { transformShow } from './transforms/vShow'
import { parserOptions } from './parserOptions'
import { stringifyStatic } from './transforms/stringifyStatic'

export { parserOptions }

export const DOMNodeTransforms: NodeTransform[] = [transformStyle]

export const DOMDirectiveTransforms: Record<string, DirectiveTransform> = {
  html: transformVHtml,
  text: transformVText,
  model: transformModel, // override compiler-core
  on: transformOn, // override compiler-core
  show: transformShow
}

export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  return baseCompile(
    template,
    extend({}, parserOptions, options, {
      nodeTransforms: [...DOMNodeTransforms, ...(options.nodeTransforms || [])],
      directiveTransforms: extend(
        {},
        DOMDirectiveTransforms,
        options.directiveTransforms || {}
      ),
      // 静态提升 transform
      transformHoist: __BROWSER__ ? null : stringifyStatic
    })
  )
}

export function parse(template: string, options: ParserOptions = {}): RootNode {
  return baseParse(template, extend({}, parserOptions, options))
}

export * from '@vue/compiler-core'
