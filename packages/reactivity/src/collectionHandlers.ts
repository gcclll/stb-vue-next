export type CollectionTypes = IterableCollections | WeakCollections
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type IterableCollections = Map<any, any> | Set<any>
