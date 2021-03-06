import { EMPTY_OBJ, isArray, isIntegerKey, isMap } from '@vue/shared'
import { TrackOpTypes, TriggerOpTypes } from './operations'

type Dep = Set<ReactiveEffect>
type KeyToDepMap = Map<any, Dep>
export const targetMap = new WeakMap<any, KeyToDepMap>()

export interface ReactiveEffect<T = any> {
  (): T
  _isEffect: true
  id: number
  active: boolean
  raw: () => T
  deps: Array<Dep>
  options: ReactiveEffectOptions
  allowRecurse: boolean
}

export interface ReactiveEffectOptions {
  lazy?: boolean
  scheduler?: (job: ReactiveEffect) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
  allowRecurse?: boolean
}

export type DebuggerEvent = {
  effect: ReactiveEffect
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
} & DebuggerEventExtraInfo

export interface DebuggerEventExtraInfo {
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

// effect 任务队列
const effectStack: ReactiveEffect[] = []
let activeEffect: ReactiveEffect | undefined
export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')

// fn 是不是经过封装之后的 ReactiveEffect
export function isEffect(fn: any): fn is ReactiveEffect {
  return fn && fn._isEffect === true
}

export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
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

export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    cleanup(effect)
    if (effect.options.onStop) {
      effect.options.onStop()
    }
    effect.active = false
  }
}

let uid = 0

function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  // 将 fn 执行封装成  ReactiveEffect 类型的函数
  const effect = function reactiveEffect(): unknown {
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
  } as ReactiveEffect

  effect.id = uid++
  effect.allowRecurse = !!options.allowRecurse
  effect._isEffect = true
  effect.active = true
  effect.raw = fn // 这里保存原始函数引用
  effect.deps = []
  effect.options = options

  return effect
}

export function cleanup(effect: ReactiveEffect) {
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
const trackStack: boolean[] = []

export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

export function resetTracking() {
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
export function track(target: object, type: TrackOpTypes, key: unknown) {
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
    if (__DEV__ && activeEffect.options.onTrack) {
      activeEffect.options.onTrack({
        effect: activeEffect,
        target,
        type,
        key
      })
    }
  }
}

export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    return
  }

  const effects = new Set<ReactiveEffect>()
  const add = (effectsToAdd: Set<ReactiveEffect> | undefined) => {
    if (effectsToAdd) {
      effectsToAdd.forEach(effect => {
        if (effect !== activeEffect || effect.allowRecurse) {
          effects.add(effect)
        }
      })
    }
  }

  if (type === TriggerOpTypes.CLEAR) {
    depsMap.forEach(add)
  } else if (key === 'length' && isArray(target)) {
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        add(dep)
      }
    })
  } else {
    // SET | ADD | DELETE operation
    if (key !== void 0) {
      add(depsMap.get(key))
    }

    // 迭代器 key，for...of, 使用迭代器是对数据的监听变化
    switch (type) {
      case TriggerOpTypes.ADD:
        if (!isArray(target)) {
          add(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            add(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        } else if (isIntegerKey(key)) {
          // 如果是数组添加元素，将 length 依赖添加到执行队列
          add(depsMap.get('length'))
        }
        break
      case TriggerOpTypes.DELETE:
        if (!isArray(target)) {
          add(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            add(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        }
        break
      case TriggerOpTypes.SET:
        if (isMap(target)) {
          add(depsMap.get(ITERATE_KEY))
        }
        break
    }
  }

  const run = (effect: ReactiveEffect) => {
    if (__DEV__ && effect.options.onTrigger) {
      effect.options.onTrigger({
        effect,
        target,
        key,
        type,
        newValue,
        oldValue,
        oldTarget
      })
    }

    if (effect.options.scheduler) {
      effect.options.scheduler(effect)
    } else {
      effect()
    }
  }

  effects.forEach(run)
}
