import { parse as _parse, ParserPlugin } from '@babel/parser'
import { SFCTemplateCompileOptions } from './compileTemplate'
import { SFCDescriptor, SFCScriptBlock } from './parse'

export interface SFCScriptCompileOptions {
  /**
   * Scope ID for prefixing injected CSS varialbes.
   * This must be consistent with the `id` passed to `compileStyle`.
   */
  id: string
  /**
   * Production mode. Used to determine whether to generate hashed CSS variables
   */
  isProd?: boolean
  /**
   * https://babeljs.io/docs/en/babel-parser#plugins
   */
  babelParserPlugins?: ParserPlugin[]
  /**
   * Enable ref: label sugar
   * https://github.com/vuejs/rfcs/pull/228
   * @default true
   */
  refSugar?: boolean
  /**
   * Compile the template and inline the resulting render function
   * directly inside setup().
   * - Only affects <script setup>
   * - This should only be used in production because it prevents the template
   * from being hot-reloaded separately from component state.
   */
  inlineTemplate?: boolean
  templateOptions?: Partial<SFCTemplateCompileOptions>
}

/**
 * Compile `<script setup>`
 * It requires the whole SFC descriptor because we need to handle and merge
 * normal `<script>` + `<script setup>` if both are present.
 */
export function compileScript(
  sfc: SFCDescriptor,
  options: SFCScriptCompileOptions
): SFCScriptBlock {
  // TODO 1. 先处理存在的 <script> 代码体
  //
  // TODO 2. 解析 <script setup>，遍历置顶的语句
  //
  // TODO 3. 将 ref访问转换成对 ref.value 的引用
  //
  // TODO 4. 释放 setup 上下文类型的运行时 props/emits 代码
  //
  // TODO 5. 检查用户选项(useOptions)参数，确保它没有引用 setup 下的变量
  //
  // TODO 6. 删除 non-script 的内容
  //
  // TODO 7. 分析 binding metadata
  //
  // TODO 8. 注入 `useCssVars` 调用
  //
  // TODO 9. 完成 setup() 参数签名
  //
  // TODO 10. 生成返回语句(return)
  //
  // TODO 11. 完成 default export
  // expose: [] makes <script setup> components "closed" by default.
  //
  // TODO 12. 完成 Vue helpers imports

  return {} as SFCScriptBlock
}
