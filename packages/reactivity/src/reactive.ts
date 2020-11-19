import { isObject, toRawType, def } from '@vue/shared'
import {
  mutableHandlers,
  shallowReactiveHandlers,
  readonlyHandlers
} from './baseHandlers'
import { UnwrapRef, Ref } from './ref'

export const enum ReactiveFlags {
  SKIP = '__v_skip',
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  RAW = '__v_raw'
}

export interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.RAW]?: any
}

export const reactiveMap = new WeakMap<Target, any>()
export const readonlyMap = new WeakMap<Target, any>()

const enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2
}

function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}

function getTargetType(value: Target) {
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
    ? TargetType.INVALID
    : targetTypeMap(toRawType(value))
}

type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

// 创建响应式对象
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // 如果试图 observe 一个只读 proxy，返回只读版本
  if (target && (target as Target)[ReactiveFlags.IS_READONLY]) {
    return target
  }

  // TODO mutableCollectionHandlers
  return createReactiveObject(target, false, mutableHandlers, {})
}

export function shallowReactive<T extends object>(target: T): T {
  // TODO shallowCollectionHandlers
  return createReactiveObject(target, false, shallowReactiveHandlers, {})
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null
type Builtin = Primitive | Function | Date | Error | RegExp
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends WeakSet<infer U>
              ? WeakSet<DeepReadonly<U>>
              : T extends Promise<infer U>
                ? Promise<DeepReadonly<U>>
                : T extends {}
                  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                  : Readonly<T>

export function readonly<T extends object>(
  target: T
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(target, true, readonlyHandlers, {})
}

function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }

    return target
  }

  // target 已经是 Proxy，不用重复代理
  // 异常情况：在一个 reactive object 上调用 readonly()
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }

  // 代理缓存中有，直接取已缓存的
  const proxyMap = isReadonly ? readonlyMap : reactiveMap
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }

  // 只有合法的类型(Object|Array|[Weak]Map|[Weak]Set)才能被代理
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }

  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers
  )

  // 缓存代理映射关系
  proxyMap.set(target, proxy)
  return proxy
}

export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) {
    // 如果是只读的，判断 value 的原始对象
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }

  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

export function toRaw<T>(observed: T): T {
  // 从 proxy 对象中取其原来的初始对象
  return (
    (observed && toRaw((observed as Target)[ReactiveFlags.RAW])) || observed
  )
}

// 标记为 raw 对象，即不可被代理的对象，设置了 __v_skip 属性
export function markRaw<T extends object>(value: T): T {
  def(value, ReactiveFlags.SKIP, true)
  return value
}
