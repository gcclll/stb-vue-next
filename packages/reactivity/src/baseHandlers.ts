// import { hasOwn, isObject, isArray, isIntegerKey } from '@vue/shared'
import { hasOwn, isIntegerKey } from '@vue/shared/src'
import { isArray } from 'util'
import { track, trigger } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { Target, toRaw } from './reactive'
import { isRef } from './ref'

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
    // TODO 2. key is readonly
    // TODO 3. key is the raw target

    // TODO 4. target is array

    const res = Reflect.get(target, key, receiver)

    // TODO 5. key is symbol, or `__protot__ | __v_isRef`

    // DONE 6. not readonly, need to track and collect deps
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    // 是否只需要 reactive 一级属性(不递归 reactive)
    if (shallow) {
      return res
    }

    // TODO 6. res isRef

    // TODO 7. res is object -> reactive recursivly

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
    // TODO 1. Ref 类型处理

    // 2. 检测 key 有没在 target 存在
    // 数组类型直接检测 数字是不是比数组长小
    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)

    // 3. 先将值设置下去
    const result = Reflect.set(target, key, value, receiver)

    // 4. 触发 effects
    // 对于原型链上发生的操作不应该触发 effects，即只响应对象自身属性的操作变更
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        // ADD 操作
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else {
        // SET 操作
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }

    return result
  }
}
export const mutableHandlers: ProxyHandler<object> = {
  get,
  set
}
