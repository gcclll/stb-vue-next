import {
  CodegenResult,
  baseParse,
  parserOptions,
  CompilerOptions,
  transform,
  transformBind,
  generate,
  transformExpression,
  trackVForSlotScopes,
  trackSlotScopes,
  transformStyle,
  noopDirectiveTransform
} from '@vue/compiler-dom'
import { ssrTransformElement } from './transforms/ssrTransformElement'
import { ssrCodegenTransform } from './ssrCodegenTransform'
import { ssrInjectFallthroughAttrs } from './transforms/ssrInjectFallthroughAttrs'
import { ssrTransformModel } from './transforms/ssrVModel'
import { ssrTransformShow } from './transforms/ssrVShow'
import { ssrTransformIf } from './transforms/ssrVIf'
import { ssrTransformFor } from './transforms/ssrVFor'
import {
  rawOptionsMap,
  ssrTransformComponent
} from './transforms/ssrTransformComponent'
import { ssrTransformSlotOutlet } from './transforms/ssrTransformSlotOutlet'

export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  options = {
    ...options,
    // 引用 DOM parser 选项
    ...parserOptions,
    ssr: true,
    scopeId: options.mode === 'function' ? null : options.scopeId,
    // 总是加上前缀，ssr 不需要关系大小
    prefixIdentifiers: true,
    // ssr 下不需要缓存和静态提升优化
    cacheHandlers: false,
    hoistStatic: false
  }

  const ast = baseParse(template, options)
  // Save raw options for AST. This is needed when performing sub-transforms
  // on slot vnode branches.
  rawOptionsMap.set(ast, options)

  transform(ast, {
    ...options,
    nodeTransforms: [
      // TODO ... ssr transforms
      ssrTransformIf,
      ssrTransformFor,

      trackVForSlotScopes,
      transformExpression,
      ssrTransformSlotOutlet,
      ssrInjectFallthroughAttrs,
      ssrTransformElement,
      ssrTransformComponent,
      trackSlotScopes,
      transformStyle,
      ...(options.nodeTransforms || []) // user transforms
    ],
    directiveTransforms: {
      // 复用 compiler-core 的 v-bind
      bind: transformBind,
      // model and show has dedicated SSR handling
      model: ssrTransformModel,
      show: ssrTransformShow,
      // ssr 中下面三个指令不处理
      on: noopDirectiveTransform,
      cloak: noopDirectiveTransform,
      once: noopDirectiveTransform,
      ...(options.directiveTransforms || {}) // user transforms
    }
  })

  // traverse the template AST and convert into SSR codegen AST
  // by replacing ast.codegenNode.
  // 将 compiler-core 阶段生成的 codegenNode 转换成 SSR codegen AST
  ssrCodegenTransform(ast, options)

  return generate(ast, options)
}
