import { hasOwn, isObject } from '@vue/shared'
import { track } from './effect'
import { TrackOpTypes } from './operations'
import { ReactiveFlags, toRaw, reactive, readonly } from './reactive'

export type CollectionTypes = IterableCollections | WeakCollections
type IterableCollections = Map<any, any> | Set<any>
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type MapTypes = Map<any, any> | WeakMap<any, any>

const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

const toReadonly = <T extends unknown>(value: T): T =>
  isObject(value) ? readonly(value as Record<any, any>) : value

const toShallow = <T extends unknown>(value: T): T => value

const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)

function get(
  target: MapTypes,
  key: unknown,
  isReadonly = false,
  isShallow = false
) {
  // TODO
  target = (target as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)

  // 下面处理是针对 key 可能是 proxy 类型
  // 次数，proxy key 和对应的 raw key 都要收集当前依赖
  const rawKey = toRaw(key) // key 有可能也是 proxy
  if (key !== rawKey) {
    // proxy key
    !isReadonly && track(rawTarget, TrackOpTypes.GET, key)
  }
  // raw key
  !isReadonly && track(rawTarget, TrackOpTypes.GET, rawKey)

  const { has } = getProto(rawTarget)
  // 递归处理对象类型
  const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive
  // 取值考虑到 rawKey 和 key 不同的情况
  if (has.call(rawTarget, key)) {
    return wrap(target.get(key))
  } else if (has.call(rawTarget, rawKey)) {
    return wrap(target.get(rawKey))
  }
}

const mutableInstrumentations: Record<string, Function> = {
  // get proxy handler, this -> target
  get(this: MapTypes, key: unknown) {
    // collection get 执行期间
    return get(this, key)
  }
}

function createInstrumentationGetter(isReadonly: boolean, shallow: boolean) {
  const instrumentations = mutableInstrumentations

  return (
    target: CollectionTypes,
    key: string | symbol,
    receiver: CollectionTypes
  ) => {
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.RAW) {
      return target
    }

    // collection get 取值期间，这里只是负责将 get/set/... 方法取出来
    // map.get() -> 分给两步: fn = map.get -> fn()
    // 取 fn 在下面，fn() 执行实际在 mutableInstrumentation 里面
    // 所以 mutableInstrumentations.get 的两个参数分别是：
    // 1. this -> map
    // 2. key -> map.get('foo') 的 'foo'
    console.log({ key, target, x: 'in ceateInstrumentationGetter' })
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target
        ? instrumentations
        : target,
      key,
      receiver
    )
  }
}
export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: createInstrumentationGetter(false, false)
}
