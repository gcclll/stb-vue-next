import { capitalize, hasOwn, isMap, isObject, toRawType } from '@vue/shared'
import { ITERATE_KEY, MAP_KEY_ITERATE_KEY, track, trigger } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import {
  ReactiveFlags,
  toRaw,
  reactive,
  readonly,
  isReactive
} from './reactive'

export type CollectionTypes = IterableCollections | WeakCollections
type IterableCollections = Map<any, any> | Set<any>
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type MapTypes = Map<any, any> | WeakMap<any, any>
type SetTypes = Set<any> | WeakSet<any>

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

function has(this: CollectionTypes, key: unknown, isReadonly = false): boolean {
  const target = (this as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)
  const rawKey = toRaw(key)
  if (key !== rawKey) {
    !isReadonly && track(rawTarget, TrackOpTypes.HAS, key)
  }
  !isReadonly && track(rawTarget, TrackOpTypes.HAS, rawKey)

  return key === rawKey
    ? target.has(key)
    : target.has(key) || target.has(rawKey)
}

function size(target: IterableCollections, isReadonly = false) {
  target = (target as any)[ReactiveFlags.RAW]
  !isReadonly && track(toRaw(target), TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.get(target, 'size', target)
}

function add(this: SetTypes, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const proto = getProto(target)
  const hadKey = proto.has.call(target, value)
  const result = target.add(value)
  // 因为 set 是不会存在重复元素的，所以只会在没有当前 key 的情况下才会执行
  // 添加操作
  if (!hadKey) {
    trigger(target, TriggerOpTypes.ADD, value, value)
  }
  return result
}

function set(this: MapTypes, key: unknown, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const { has, get } = getProto(target)

  let hadKey = has.call(target, key)
  // 考虑 key 可能是 proxy
  if (!hadKey) {
    // to add
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }

  const oldValue = get.call(target, key)
  // 设值结果
  const result = target.set(key, value)
  if (!hadKey) {
    // 添加操作
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else {
    // 设值操作
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }

  return result
}

function deleteEntry(this: CollectionTypes, key: unknown) {
  const target = toRaw(this)
  const { has, get } = getProto(target)
  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }

  const oldValue = get ? get.call(target, key) : undefined
  const result = target.delete(key)
  if (hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function clear(this: IterableCollections) {
  const target = toRaw(this)
  const hadItems = target.size !== 0
  const oldTarget = __DEV__
    ? isMap(target)
      ? new Map(target)
      : new Set(target)
    : undefined

  const result = target.clear()
  if (hadItems) {
    trigger(target, TriggerOpTypes.CLEAR, undefined, undefined, oldTarget)
  }
  return result
}

function createForEach(isReadonly: boolean, isShallow: boolean) {
  return function forEach(
    this: IterableCollections,
    callback: Function,
    thisArg?: unknown
  ) {
    const observed = this as any
    const target = observed[ReactiveFlags.RAW]
    const rawTarget = toRaw(target)
    const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive
    !isReadonly && track(rawTarget, TrackOpTypes.ITERATE, ITERATE_KEY)
    return target.forEach((value: unknown, key: unknown) => {
      // 重要：确保回调
      // 1. 在 reactive map 作用域下被执行(this, 和第三个参数)
      // 2. 接受的 value 值应该是个 reactive/readonly 类型
      return callback.call(thisArg, wrap(value), wrap(key), observed)
    })
  }
}

const mutableInstrumentations: Record<string, Function> = {
  // get proxy handler, this -> target
  get(this: MapTypes, key: unknown) {
    // collection get 执行期间
    return get(this, key)
  },
  get size() {
    return size((this as unknown) as IterableCollections)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false, false)
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

function checkIdentityKeys(
  target: CollectionTypes,
  has: (key: unknown) => boolean,
  key: unknown
) {
  // 同时有 key 和 proxy key 存在的情况
  const rawKey = toRaw(key)
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target)
    console.warn(
      `Reactive ${type} contains both the raw and reactive ` +
        `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
        `which can lead to inconsistencies. ` +
        `Avoid differentiating between the raw and reactive versions ` +
        `of an object and only use the reactive version if possible.`
    )
  }
}
