// API
export { parse } from './parse'
export { compileTemplate } from './compileTemplate'
export { generateCodeFrame } from '@vue/compiler-core'

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
  CompilerOptions,
  CompilerError,
  BindingMetadata
} from '@vue/compiler-core'
