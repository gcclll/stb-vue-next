import {
  createSetupContext,
  getCurrentInstance,
  SetupContext
} from './component'
import { EmitFn, EmitsOptions } from './componentEmits'
import { ComponentObjectPropsOptions, ExtractPropTypes } from './componentProps'
import { warn } from './warning'

/**
 * Compile-time-only helper used for declaring props inside `<script setup>`.
 * This is stripped away in the compiled code and should never be actually
 * called at runtime.
 * 这只会在 <script setup> 中被调用，传递给它的参数，会在 babel/parser 解析
 * 期间处理之后合并到 export -> props 中，所以这里 defineProps 的实现实际上
 * 什么都没做
 */
// overload 1: string props
export function defineProps<
  TypeProps = undefined,
  PropNames extends string = string,
  InferredProps = { [key in PropNames]?: any }
>(
  props?: PropNames[]
): Readonly<TypeProps extends undefined ? InferredProps : TypeProps>

// overload 2: object props
export function defineProps<
  TypeProps = undefined,
  PP extends ComponentObjectPropsOptions = ComponentObjectPropsOptions,
  InferredProps = ExtractPropTypes<PP>
>(props?: PP): Readonly<TypeProps extends undefined ? InferredProps : TypeProps>

// implementation
export function defineProps() {
  if (__DEV__) {
    warn(
      `defineProps() is a compiler-hint helper that is only usable inside ` +
        `<script setup> of a single file component. Its arguments should be ` +
        `compiled away and passing it at runtime has no effect.`
    )
  }
  return null as any
}

// 和 defineProps 一样在 <script setup> 期间使用
// 参数最后合并到 export -> emits {} 上
export function defineEmit<
  TypeEmit = undefined,
  E extends EmitsOptions = EmitsOptions,
  EE extends string = string,
  InferredEmit = EmitFn<E>
>(emitOptions?: E | EE[]): TypeEmit extends undefined ? InferredEmit : TypeEmit
// implementation
export function defineEmit() {
  if (__DEV__) {
    warn(
      `defineEmit() is a compiler-hint helper that is only usable inside ` +
        `<script setup> of a single file component. Its arguments should be ` +
        `compiled away and passing it at runtime has no effect.`
    )
  }
  return null as any
}

export function useContext(): SetupContext {
  const i = getCurrentInstance()!
  if (__DEV__ && !i) {
    warn(`useContext() called without active instance.`)
  }
  return i.setupContext || (i.setupContext = createSetupContext())
}
