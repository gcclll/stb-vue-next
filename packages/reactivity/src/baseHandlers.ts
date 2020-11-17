import {
  hasOwn,
  // isObject,
  isArray,
  isIntegerKey,
  hasChanged,
  isObject,
  isSymbol
} from '@vue/shared'
import { ITERATE_KEY, track, trigger } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import {
  reactive,
  ReactiveFlags,
  reactiveMap,
  readonlyMap,
  Target,
  toRaw
} from './reactive'

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()
const set = /*#__PURE__*/ createSetter()

/**
 * 创建取值函数@param {boolean} isReadonly 是不是只读，将决定是否代理 set 等改变
 * 对象操作@param {boolean} shallow 指定是否对对象进行浅 reactive(类似浅复制)，
 * 只对一级属性进行 reactive
 */
function createGetter(isReadonly = false, shallow = false) {
  // target: 被取值的对象，key: 取值的属性，receiver: this 的值
  return function get(target: Target, key: string | symbol, receiver: object) {
    // TODO 1. key is reactive
    if (key === ReactiveFlags.IS_REACTIVE) {
      // 读取对象的 __v_isReactive
      return !isReadonly
    }
    // TODO 2. key is readonly
    // TODO 3. key is the raw target
    if (
      key === ReactiveFlags.RAW &&
      receiver === (isReadonly ? readonlyMap : reactiveMap).get(target)
    ) {
      return target
    }
    // TODO 4. target is array

    const res = Reflect.get(target, key, receiver)

    if (
      isSymbol(key)
        ? builtInSymbols.has(key as symbol)
        : key === `__proto__` || key === `__v_isRef`
    ) {
      return res
    }

    if (!isReadonly) {
      // DONE 6. not readonly, need to track and collect deps
      track(target, TrackOpTypes.GET, key)
    }

    // 是否只需要 reactive 一级属性(不递归 reactive)
    if (shallow) {
      return res
    }

    // TODO 6. res isRef

    // TODO 7. res is object -> reactive recursivly
    if (isObject(res)) {
      // 递归 reactive 嵌套对象，feat: b2143f9
      return isReadonly ? null /* TODO */ : reactive(res)
    }

    return res
  }
}

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    const oldValue = (target as any)[key]
    // TODO shallow or not, or ref ?
    //

    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)

    const result = Reflect.set(target, key, value, receiver)

    if (target === toRaw(receiver)) {
      if (!hadKey) {
        // TODO ADD
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }

    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    // 删除成功，触发 DELETE
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY)
  return Reflect.ownKeys(target)
}
export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}
