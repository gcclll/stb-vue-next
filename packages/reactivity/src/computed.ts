import { Ref } from './ref'

export interface ComputedRef<T = any> extends WritableComputedRef<T> {}

export interface WritableComputedRef<T> extends Ref<T> {}

export type ComputedGetter<T> = (ctx?: any) => T

export type ComputedSetter<T> = (v: T) => void

export interface WritableComputedOptions<T> {}
