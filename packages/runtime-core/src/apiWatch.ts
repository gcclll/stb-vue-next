import {
  ComputedRef,
  effect,
  isReactive,
  isRef,
  ReactiveEffectOptions,
  Ref,
  stop
} from '@vue/reactivity'
import {
  EMPTY_OBJ,
  hasChanged,
  isArray,
  isFunction,
  isObject,
  isSet,
  isMap,
  NOOP,
  remove
} from '@vue/shared'
import { warn } from './warning'
import { currentInstance, recordInstanceBoundEffect } from './component'
import { queuePreFlushCb, SchedulerJob } from './scheduler'
import {
  callWithAsyncErrorHandling,
  callWithErrorHandling,
  ErrorCodes
} from './errorHandling'

export type WatchEffect = (onInvalidate: InvalidateCbRegistrator) => void

export type WatchSource<T = any> = Ref<T> | ComputedRef<T> | (() => T)

export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onInvalidate: InvalidateCbRegistrator
) => any

type MapSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
    ? Immediate extends true ? (V | undefined) : V
    : T[K] extends object
      ? Immediate extends true ? (T[K] | undefined) : T[K]
      : never
}

type InvalidateCbRegistrator = (cb: () => void) => void

export interface WatchOptionsBase {
  flush?: 'pre' | 'post' | 'sync'
  onTrack?: ReactiveEffectOptions['onTrack']
  onTrigger?: ReactiveEffectOptions['onTrigger']
}

export interface WatchOptions<Immediate = boolean> extends WatchOptionsBase {
  immediate?: Immediate
  deep?: boolean
}

export type WatchStopHandle = () => void

// simple effect
export function watchEffect(
  effect: WatchEffect,
  options?: WatchOptionsBase
): WatchStopHandle {
  return doWatch(effect, null, options)
}

// initial value for watchers to trigger on undefined initial values
const INITIAL_WATCHER_VALUE = {}

type MultiWatchSources = (WatchSource<unknown> | object)[]

// overload #1: array of multiple sources + cb
export function watch<
  T extends MultiWatchSources,
  Immediate extends Readonly<boolean> = false
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>
): WatchStopHandle

// overload #2 for multiple sources w/ `as const`
// watch([foo, bar] as const, () => {})
// somehow [...T] breaks when the type is readonly
export function watch<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false
>(
  source: T,
  cb: WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>
): WatchStopHandle

// overload #2: single source + cb
export function watch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? (T | undefined) : T>,
  options?: WatchOptions<Immediate>
): WatchStopHandle

// overload #3: watching reactive object w/ cb
export function watch<
  T extends object,
  Immediate extends Readonly<boolean> = false
>(
  source: T,
  cb: WatchCallback<T, Immediate extends true ? (T | undefined) : T>,
  options?: WatchOptions<Immediate>
): WatchStopHandle

// implementation
export function watch<T = any, Immediate extends Readonly<boolean> = false>(
  source: T | WatchSource<T>,
  cb: any,
  options?: WatchOptions<Immediate>
): WatchStopHandle {
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
        `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
        `supports \`watch(source, cb, options?) signature.`
    )
  }
  return doWatch(source as any, cb, options)
}

function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb: WatchCallback | null,
  { immediate, deep, flush, onTrack, onTrigger }: WatchOptions = EMPTY_OBJ,
  instance = currentInstance
): WatchStopHandle {
  // 1. cb, immediate, deep 检测
  if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      warn(
        `watch() "immediate" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      )
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      )
    }
  }

  const warnInvalidSource = (s: unknown) => {
    warn(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, ` +
        `a reactive object, or an array of these types.`
    )
  }
  // 2. TODO getter 函数，根据不同类型生成对应的 getter
  let getter: () => any
  let forceTrigger = false
  // 2.1 source is ref
  if (isRef(source)) {
    getter = () => (source as Ref).value
    forceTrigger = !!(source as Ref)._shallow
  }
  // 2.2 source is reactive
  else if (isReactive(source)) {
    getter = () => source
    deep = true
  }
  // 2.3 source is array
  else if (isArray(source)) {
    getter = () =>
      source.map(s => {
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          return traverse(s)
        } else if (isFunction(s)) {
          return callWithErrorHandling(s, instance, ErrorCodes.WATCH_GETTER)
        } else {
          __DEV__ && warnInvalidSource(s)
        }
      })
  }
  // 2.4 source is function
  else if (isFunction(source)) {
    // 如果是函数，直接执行取得函数执行结果
    if (cb) {
      // getter with cb
      getter = () =>
        callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER)
    } else {
      // no cb -> simple effect
      getter = () => {
        if (instance && instance.isUnmounted) {
          // 组件已经卸载了
          return
        }

        if (cleanup) cleanup()

        return callWithErrorHandling(
          source,
          instance,
          ErrorCodes.WATCH_CALLBACK,
          [onInvalidate]
        )
      }
    }
  }
  // 2.5 其他情况
  else {
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }
  //
  // 3. cb + deep: true
  if (cb && deep) {
    const baseGetter = getter
    // a. deep: true

    // b. source is reactive
    getter = () => traverse(baseGetter())
  }

  let cleanup: () => void
  const onInvalidate: InvalidateCbRegistrator = (fn: () => void) => {
    cleanup = runner.options.onStop = () => {
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP)
    }
  }
  // 4. TODO SSR + node env
  //
  // 5. job 任务封装 -> queueJob
  let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE
  const job: SchedulerJob = () => {
    if (!runner.active) {
      return
    }
    if (cb) {
      // watch(source, cb)
      const newValue = runner()
      if (deep || forceTrigger || hasChanged(newValue, oldValue)) {
        // cleanup
        if (cleanup) cleanup()
        callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
          newValue,
          // pass undefined as the old value when it's changed for the first time
          // 第一次的时候 oldValue 为 undefined
          oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
          onInvalidate
        ])
        oldValue = newValue
      }
    } else {
      // watchEffect, no cb
      runner()
    }
  }
  //
  // 6. TODO scheduler 设置
  let scheduler: ReactiveEffectOptions['scheduler']
  // 6.1 flush is 'sync'
  if (false /* async */) {
  }
  // 6.2 TODO flush is 'post'
  else if (false /* post */) {
  }
  // 6.3 TODO flush is 'pre'(default)
  else {
    // default: 'pre'
    scheduler = () => {
      if (!instance || instance.isMounted) {
        queuePreFlushCb(job)
      } else {
        // 带 { pre: true } 选项，第一次调用必须发生在组件 mounted 之前
        // 从而使他被同步调用，立即执行一次
        job()
      }
    }
  }
  //
  // 7. get runner
  const runner = effect(getter, {
    lazy: true,
    onTrack,
    onTrigger,
    scheduler
  })
  //
  // 8. TODO runner 如何执行？
  if (cb) {
    if (immediate) {
      job()
    } else {
      oldValue = runner()
    }
  } else if (false /*flush->post*/) {
  } else {
    runner()
  }
  //
  // 9. return runner->stop, remove runner from instance.effects
  return () => {
    stop(runner)
    if (instance) {
      remove(instance.effects!, runner)
    }
  }
}

function traverse(value: unknown, seen: Set<unknown> = new Set()) {
  if (!isObject(value) || seen.has(value)) {
    return value
  }
  seen.add(value)
  if (isRef(value)) {
    traverse(value.value, seen)
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], seen)
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v: any) => {
      traverse(v, seen)
    })
  } else {
    for (const key in value) {
      traverse(value[key], seen)
    }
  }
  return value
}
