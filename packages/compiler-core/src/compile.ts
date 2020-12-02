import { extend, isString } from '@vue/shared'
import { RootNode } from './ast'
import { CodegenResult, generate } from './codegen'
// import { defaultOnError } from './errors'
import { CompilerOptions } from './options'
import { baseParse } from './parse'
import { NodeTransform, DirectiveTransform, transform } from './transform'
import { transformOn } from './transforms/vOn'
import { transformText } from './transforms/transformText'
import { transformElement } from './transforms/transformElement'

export type TransformPreset = [
  NodeTransform[],
  Record<string, DirectiveTransform>
]

// 合并 transform 插件列表
export function getBaseTransformPreset(
  prefixIdentifiers?: boolean
): TransformPreset {
  return [
    [transformElement, transformText],
    {
      on: transformOn
    }
  ]
}

export function baseCompile(
  template: string | RootNode,
  options: CompilerOptions = {}
): CodegenResult {
  // const onError = options.onError || defaultOnError
  const isModuleMode = options.mode === 'module'

  const prefixIdentifiers =
    !__BROWSER__ && (options.prefixIdentifiers === true || isModuleMode)

  // TODO errors
  const ast = isString(template) ? baseParse(template, options) : template
  const [nodeTransforms, directiveTransforms] = getBaseTransformPreset(
    prefixIdentifiers
  )

  transform(
    ast,
    extend({}, options, {
      prefixIdentifiers,
      nodeTransforms: [
        ...nodeTransforms,
        ...(options.nodeTransforms || []) // user transforms
      ],
      directiveTransforms: extend(
        {},
        directiveTransforms,
        options.directiveTransforms || {}
      )
    })
  )

  return generate(
    ast,
    extend({}, options, {
      prefixIdentifiers
    })
  )
}
