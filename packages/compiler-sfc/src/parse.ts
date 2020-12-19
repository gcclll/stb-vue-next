import { Statement } from '@babel/types'
import * as CompilerDOM from '@vue/compiler-dom'
import {
  BindingMetadata,
  CompilerError,
  ElementNode,
  NodeTypes,
  SourceLocation,
  TextModes
} from '@vue/compiler-core'
import { RawSourceMap } from 'source-map'
import { TemplateCompiler } from './compileTemplate'
import { parseCssVars } from './cssVars'
import { warnExperimental } from './warn'

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

const SFC_CACHE_MAX_SIZE = 500
const sourceToSFC =
  __GLOBAL__ || __ESM_BROWSER__
    ? new Map<string, SFCParseResult>()
    : (new (require('lru-cache'))(SFC_CACHE_MAX_SIZE) as Map<
        string,
        SFCParseResult
      >)

export function parse(
  source: string,
  {
    sourceMap = true,
    filename = 'anonymous.vue',
    sourceRoot = '',
    pad = false,
    compiler = CompilerDOM
  }: SFCParseOptions
): SFCParseResult {
  const sourceKey =
    source + sourceMap + filename + sourceRoot + pad + compiler.parse

  const cache = sourceToSFC.get(sourceKey)

  if (cache) {
    return cache
  }

  const descriptor: SFCDescriptor = {
    filename,
    source,
    template: null,
    script: null,
    scriptSetup: null,
    styles: [],
    customBlocks: [],
    cssVars: []
  }

  const errors: (CompilerError | SyntaxError)[] = []
  const ast = compiler.parse(source, {
    // there are no components at SFC parsing level
    isNativeTag: () => true,
    // preserve all whitespaces
    isPreTag: () => true,
    getTextMode: ({ tag, props }, parent) => {
      // all top level elements except <template> are parsed as raw text
      // containers
      // 除了模板标签都当做普通文本容器处理
      if (
        (!parent && tag !== 'template') ||
        // <template lang="xxx"> should also be treated as raw text
        (tag === 'template' &&
          props.some(
            p =>
              p.type === NodeTypes.ATTRIBUTE &&
              p.name === 'lang' &&
              p.value &&
              p.value.content !== 'html'
          ))
      ) {
        return TextModes.RAWTEXT
      } else {
        return TextModes.DATA
      }
    },
    onError: e => {
      errors.push(e)
    }
  })

  // SFC ast 解析
  ast.children.forEach(node => {
    // 首先必须是标签类型
    if (node.type !== NodeTypes.ELEMENT) {
      return
    }

    // 这里只处理 template 类型标签，或者有 src 属性的标签，可能是 <script src=???
    if (!node.children.length && !hasSrc(node) && node.tag !== 'template') {
      return
    }

    switch (node.tag) {
      case 'template': // TODO模板处理
        break
      case 'script': // TODO脚本处理
        break
      case 'style': // TODO样式标签
        break
      default:
        // TODO其他标签处理，比如：自定义标签
        descriptor.customBlocks.push({} as any)
        break
    }
  })

  if (descriptor.scriptSetup) {
    // <script setup> 上不能有 src 属性
    if (descriptor.scriptSetup.src) {
      errors.push(
        new SyntaxError(
          `<script setup> cannot use the "src" attribute because ` +
            `its syntax will be ambiguous outside of the component.`
        )
      )
      descriptor.scriptSetup = null
    }

    // 如果有 <script setup> 的时候，<script src> 不允许使用
    // 因为他们会放在一起处理
    if (descriptor.script && descriptor.script.src) {
      errors.push(
        new SyntaxError(
          `<script> cannot use the "src" attribute when <script setup> is ` +
            `also present because they must be processed together.`
        )
      )
      descriptor.script = null
    }
  }

  if (sourceMap) {
    // TODO source map
  }

  // 解析 css 变量
  descriptor.cssVars = parseCssVars(descriptor)
  if (descriptor.cssVars.length) {
    warnExperimental(`v-bind() CSS variable inject`, 231)
  }

  const result = {
    descriptor,
    errors
  }

  sourceToSFC.set(sourceKey, result)

  return result
}

function hasSrc(node: ElementNode) {
  return node.props.some(p => {
    if (p.type !== NodeTypes.ATTRIBUTE) {
      return false
    }

    return p.name === 'src'
  })
}
