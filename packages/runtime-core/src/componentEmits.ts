import { isOn, hasOwn, hyphenate } from '@vue/shared'
import { UnionToIntersection } from './helpers/typeUtils'
import { ComponentInternalInstance } from './component'

export type ObjectEmitsOptions = Record<
  string,
  ((...args: any[]) => any) | null
>
export type EmitsOptions = ObjectEmitsOptions | string[]

export type EmitFn<
  Options = ObjectEmitsOptions,
  Event extends keyof Options = keyof Options
> = Options extends Array<infer V>
  ? (event: V, ...args: any[]) => void
  : {} extends Options // if the emit is empty object (usually the default value for emit) should be converted to function
    ? (event: string, ...args: any[]) => void
    : UnionToIntersection<
        {
          [key in Event]: Options[key] extends ((...args: infer Args) => any)
            ? (event: key, ...args: Args) => void
            : (event: key, ...args: any[]) => void
        }[Event]
      >

export function emit(
  instance: ComponentInternalInstance,
  event: string,
  ...rawArgs: any[]
) {}

export function isEmitListener(
  options: ObjectEmitsOptions | null,
  key: string
): Boolean {
  if (!options || !isOn(key)) {
    return false
  }
  //onXxxx or onXxxOnce, 因为 @click.once 会解析成 onClickOnce
  key = key.slice(2).replace(/Once$/, '')
  // 检测条件：
  // 1. slice(1) 应该是去掉 @click 中的 `@` ?
  // 2. clickEvent -> click-event
  // 3. click
  // 支持三种形式的事件名
  return (
    hasOwn(options, key[0].toLowerCase() + key.slice(1)) ||
    // onClick -> on-click
    hasOwn(options, hyphenate(key)) ||
    hasOwn(options, key)
  )
}
