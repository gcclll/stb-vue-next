// import { hasOwn, isObject, isArray, isIntegerKey } from '@vue/shared'
import { track } from './effect'
import { TrackOpTypes } from './operations'
import { Target } from './reactive'

const get = /*#__PURE__*/ createGetter()

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

    console.log({ res }, 'get')
    return res
  }
}
export const mutableHandlers: ProxyHandler<object> = {
  get
}
