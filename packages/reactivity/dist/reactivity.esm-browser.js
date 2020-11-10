const EMPTY_OBJ = Object.freeze({})
const EMPTY_ARR = Object.freeze([])
const isObject = val => val !== null && typeof val === 'object'
const objectToString = Object.prototype.toString
const toTypeString = value => objectToString.call(value)
const toRawType = value => {
  // extract "RawType" from strings like "[object RawType]"
  return toTypeString(value).slice(8, -1)
}

const get = /*#__PURE__*/ createGetter()
/**
 * 创建取值函数@param {boolean} isReadonly 是不是只读，将决定是否代理 set 等改变
 * 对象操作@param {boolean} shallow 指定是否对对象进行浅 reactive(类似浅复制)，
 * 只对一级属性进行 reactive
 */
function createGetter(isReadonly = false, shallow = false) {
  // target: 被取值的对象，key: 取值的属性，receiver: this 的值
  return function get(target, key, receiver) {
    // TODO 1. key is reactive
    // TODO 2. key is readonly
    // TODO 3. key is the raw target
    // TODO 4. target is array
    const res = Reflect.get(target, key, receiver)
    // TODO 5. key is symbol, or `__protot__ | __v_isRef`
    // TODO 6. not readonly, need to track and collect deps
    // 是否只需要 reactive 一级属性(不递归 reactive)
    if (shallow) {
      return res
    }
    // TODO 6. res isRef
    // TODO 7. res is object -> reactive recursivly
    console.log({ res }, 'get')
    return res
  }
}
const mutableHandlers = {
  get
}

const reactiveMap = new WeakMap()
const readonlyMap = new WeakMap()
function targetTypeMap(rawType) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return 1 /* COMMON */
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return 2 /* COLLECTION */
    default:
      return 0 /* INVALID */
  }
}
function getTargetType(value) {
  return value['__v_skip' /* SKIP */] || !Object.isExtensible(value)
    ? 0 /* INVALID */
    : targetTypeMap(toRawType(value))
}
function reactive(target) {
  // 如果试图 observe 一个只读 proxy，返回只读版本
  if (target && target['__v_isReadonly' /* IS_READONLY */]) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    {}
    // mutableCollectionHandlers
  )
}
function createReactiveObject(
  target,
  isReadonly,
  baseHandlers,
  collectionHandlers
) {
  if (!isObject(target)) {
    {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target 已经是 Proxy，不用重复代理
  // 异常情况：在一个 reactive object 上调用 readonly()
  if (
    target['__v_raw' /* RAW */] &&
    !(isReadonly && target['__v_isReactive' /* IS_REACTIVE */])
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
  if (targetType === 0 /* INVALID */) {
    return target
  }
  const proxy = new Proxy(
    target,
    targetType === 2 /* COLLECTION */ ? collectionHandlers : baseHandlers
  )
  // 缓存代理映射关系
  proxyMap.set(target, proxy)
  return proxy
}

export { reactive }
