import { hasOwn } from '@vue/shared'
import { ReactiveFlags } from './reactive'

export type CollectionTypes = IterableCollections | WeakCollections
type IterableCollections = Map<any, any> | Set<any>
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type MapTypes = Map<any, any> | WeakMap<any, any>

function get(
  target: MapTypes,
  key: unknown,
  isReadonly = false,
  isShallow = false
) {
  // TODO

  console.log({ target, key })
  // FIX: 死循环
  return 100
  // return target.get(key)
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
