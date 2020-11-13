'use strict'

Object.defineProperty(exports, '__esModule', { value: true })

var shared = require('@vue/shared')

const targetMap = new WeakMap()
// effect 任务队列
const effectStack = []
let activeEffect
const ITERATE_KEY = Symbol('')
const MAP_KEY_ITERATE_KEY = Symbol('')
// fn 是不是经过封装之后的 ReactiveEffect
function isEffect(fn) {
  return fn && fn._isEffect === true
}
function effect(fn, options = shared.EMPTY_OBJ) {
  if (isEffect(fn)) {
    fn = fn.raw // 取出原始的函数，封装之前的
  }
  // 封装成 ReactiveEffect
  const effect = createReactiveEffect(fn, options)
  if (!options.lazy) {
    // 如果并没指定 lazy: true 选项，则立即执行 effect 收集依赖
    // 因为 effect 一般都会有取值操作，此时会触发 proxy get handler
    // 然后执行 track() 结合当前的 activeEffect 即 effect() 执行时候的这个
    // effect，这样取值操作就和当前取值作用域下的依赖函数建立的依赖关系
    effect()
  }
  return effect
}
let uid = 0
function createReactiveEffect(fn, options) {
  // 将 fn 执行封装成  ReactiveEffect 类型的函数
  const effect = function reactiveEffect() {
    if (!effect.active) {
      // 非激活状态，可能是手动调用了 stop
      // 那么执行的时候就需要考虑调用 stop 者是否提供了手动调度该 effect
      // 的函数 scheduler ? 也就是说你停止你可以重新启动
      return options.scheduler ? undefined : fn()
    }
    if (!effectStack.includes(effect)) {
      // 1. cleanup, 保持纯净
      cleanup(effect)
      try {
        // 2. 使其 tracking 状态有效，track() 中有用
        enableTracking() // track() 可以执行收集操作
        effectStack.push(effect) // effect 入栈
        // 3. 保存为当前的 activeEffect, track() 中有用
        activeEffect = effect // 记录当前的 effect -> track/trigger
        // 4. 执行 fn 并返回结果
        return fn() // 返回执行结果
      } finally {
        // 始终都会执行，避免出现异常将 effect 进程卡死
        // 5. 如果执行异常，丢弃当前的 effect ，并将状态重置为上一个 effect
        //   由一个 effect 栈来维护。
        effectStack.pop()
        resetTracking()
        activeEffect = effectStack[effectStack.length - 1]
      }
    }
  }
  effect.id = uid++
  effect.allowRecurse = !!options.allowRecurse
  effect._isEffect = true
  effect.active = true
  effect.raw = fn // 这里保存原始函数引用
  effect.deps = []
  effect.options = options
  return effect
}
function cleanup(effect) {
  // track() 里面执行dep.add 的同时会将当前被依赖对象存储到
  // activeEffect.deps 里面，这里就是讲这些收集的被依赖者列表全清空
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}
// 当前 effect 没有完成情况下不接受下一个动作
let shouldTrack = true
const trackStack = []
function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}
function resetTracking() {
  // 重置为上一个 effect track的状态
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}
/**
 * 负责收集依赖
 * @param {object} target 被代理的原始对象
 * @param {TrackOpTypes} type 操作类型, get/has/iterate
 * @param {unknown} key
 */
function track(target, type, key) {
  if (!shouldTrack || activeEffect === undefined) {
    return
  }
  // Map< obj -> Map<key, Set[...deps]> >
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    // 初始化
    targetMap.set(target, (depsMap = new Map()))
  }
  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, (dep = new Set()))
  }
  // 正在请求收集的 effect ，是初次出现
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect)
    // 自身保存一份被依赖者名单
    activeEffect.deps.push(dep)
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  // 1. 检查依赖
  const depsMap = targetMap.get(target)
  if (!depsMap) return
  // 2. 定义 add dep 函数，将符合要求的 effect 添加到将执行队列
  const effects = new Set()
  const add = effectsToAdd => {
    if (effectsToAdd) {
      effectsToAdd.forEach(effect => {
        // 哪些满足执行条件
        if (effect !== activeEffect || effect.allowRecurse) {
          effects.add(effect)
        }
      })
    }
  }
  // 3. 检测触发 trigger 的原始操作类型
  if (type === 'clear' /* CLEAR */) {
    // 集合类型的清空操作，执行所有依赖
    depsMap.forEach(add)
  } else if (key === 'length' && shared.isArray(target)) {
    // 如果是数组，且长度发生变化，表示删除或添加元素操作
    depsMap.forEach((dep, key) => {
      // dep: Set[], key -> 'length'
      if (key === 'length' || key >= newValue) {
        // key >= newValue 可能是 arr[n] = xxx 设值操作
        // key === 'length' 导致数组变化，可能是 push/pop... 等操作引起
        add(dep)
      }
    })
  } else {
    if (key !== void 0) {
      add(depsMap.get(key))
    }
    const addForNonArray = () => {
      add(depsMap.get(ITERATE_KEY))
      if (shared.isMap(target)) {
        add(depsMap.get(MAP_KEY_ITERATE_KEY))
      }
    }
    switch (type) {
      case 'add' /* ADD */: // 增
        if (!shared.isArray(target)) {
          addForNonArray()
        } else if (shared.isIntegerKey(key)) {
          add(depsMap.get('length'))
        }
        break
      case 'delete' /* DELETE */: // 删
        if (!shared.isArray(target)) {
          addForNonArray()
        }
        break
      case 'set' /* SET */: // 改
        if (shared.isMap(target)) {
          add(depsMap.get(ITERATE_KEY))
        }
        break
    }
  }
  // 4. 定义 run 函数，如何执行这些 deps
  const run = effect => {
    if (effect.options.scheduler) {
      effect.options.scheduler(effect)
    } else {
      effect()
    }
  }
  // 5. 开始执行
  effects.forEach(run)
}

// import { hasOwn, isObject, isArray, isIntegerKey } from '@vue/shared'
const get = /*#__PURE__*/ createGetter()
const set = /*#__PURE__*/ createSetter()
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
    // DONE 6. not readonly, need to track and collect deps
    if (!isReadonly) {
      track(target, 'get' /* GET */, key)
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
  return function set(target, key, value, receiver) {
    const oldValue = target[key]
    // TODO 1. Ref 类型处理
    // 2. 检测 key 有没在 target 存在
    // 数组类型直接检测 数字是不是比数组长小
    const hadKey =
      shared.isArray(target) && shared.isIntegerKey(key)
        ? Number(key) < target.length
        : shared.hasOwn(target, key)
    // 3. 先将值设置下去
    const result = Reflect.set(target, key, value, receiver)
    // 4. 触发 effects
    // 对于原型链上发生的操作不应该触发 effects，即只响应对象自身属性的操作变更
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        // ADD 操作
        trigger(target, 'add' /* ADD */, key, value)
      } else {
        // SET 操作
        trigger(target, 'set' /* SET */, key, value)
      }
    }
    return result
  }
}
const mutableHandlers = {
  get,
  set
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
    : targetTypeMap(shared.toRawType(value))
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
  if (!shared.isObject(target)) {
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
function isReactive(value) {
  if (isReadonly(value)) {
    // 如果是只读的，判断 value 的原始对象
    return isReactive(value['__v_raw' /* RAW */])
  }
  return !!(value && value['__v_isReactive' /* IS_REACTIVE */])
}
function isReadonly(value) {
  return !!(value && value['__v_isReadonly' /* IS_READONLY */])
}
function isProxy(value) {
  return isReactive(value) || isReadonly(value)
}
function toRaw(observed) {
  // 从 proxy 对象中取其原来的初始对象
  return (observed && toRaw(observed['__v_raw' /* RAW */])) || observed
}
// 标记为 raw 对象，即不可被代理的对象，设置了 __v_skip 属性
function markRaw(value) {
  shared.def(value, '__v_skip' /* SKIP */, true)
  return value
}

exports.effect = effect
exports.enableTracking = enableTracking
exports.isProxy = isProxy
exports.isReactive = isReactive
exports.isReadonly = isReadonly
exports.markRaw = markRaw
exports.reactive = reactive
exports.resetTracking = resetTracking
exports.targetMap = targetMap
exports.toRaw = toRaw
exports.track = track
exports.trigger = trigger
