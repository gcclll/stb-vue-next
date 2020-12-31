// API
export { parse } from './parse'
export { compileTemplate } from './compileTemplate'
export { compileStyle, compileStyleAsync } from './compileStyle'
export { compileScript } from './compileScript'
export { rewriteDefault } from './rewriteDefault'
export {
  generateCodeFrame,
  generate,
  baseParse,
  transform,
  transformElement,
  transformBind
} from '@vue/compiler-core'
export {
  transformSrcset,
  createSrcsetTransformWithOptions
} from './templateTransformSrcset'
export { AssetURLOptions, normalizeOptions } from './templateTransformAssetUrl'

// Types
export {
  SFCParseOptions,
  SFCDescriptor,
  SFCBlock,
  SFCTemplateBlock,
  SFCScriptBlock,
  SFCStyleBlock
} from './parse'
export {
  TemplateCompiler,
  SFCTemplateCompileOptions,
  SFCTemplateCompileResults
} from './compileTemplate'
export {
  SFCStyleCompileOptions,
  SFCAsyncStyleCompileOptions,
  SFCStyleCompileResults
} from './compileStyle'
export { SFCScriptCompileOptions } from './compileScript'
export {
  CompilerOptions,
  CompilerError,
  BindingMetadata
} from '@vue/compiler-core'
