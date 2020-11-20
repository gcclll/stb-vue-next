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
  return target.get(key)
}

const mutableInstrumentations: Record<string, Function> = {
  // get proxy handler, this -> target
  get(this: MapTypes, key: unknown) {
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
