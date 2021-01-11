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

  let getter: () => any
  let forceTrigger = false
  if (isRef(source)) {
    getter = () => (source as Ref).value
    forceTrigger = !!(source as Ref)._shallow
  } else if (isReactive(source)) {
    getter = () => source
    deep = true
  } else if (isArray(source)) {
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
  } else if (isFunction(source)) {
    if (cb) {
      // getter with cb
      getter = () =>
        callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER)
    } else {
      // no cb -> simple effect
      getter = () => {
        if (instance && instance.isUnmounted) {
          // 组件可能被卸载了
          return
        }
        if (cleanup) {
          cleanup()
        }

        // 在 try...catch 里面执行 source 这里是个 effect fn
        return callWithErrorHandling(
          source,
          instance,
          ErrorCodes.WATCH_CALLBACK,
          [onInvalidate]
        )
      }
    }
  } else {
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }

  if (cb && deep) {
    const baseGetter = getter
    getter = () => traverse(baseGetter())
  }

  let cleanup: () => void
  const onInvalidate: InvalidateCbRegistrator = (fn: () => void) => {
    cleanup = runner.options.onStop = () => {
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP)
    }
  }

  // TODO in SSR there is no need to setup an actual effect, and it should be noop
  // unless it's eager

  let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE
  const job: SchedulerJob = () => {
    if (!runner.active) {
      // 可能被 stop 掉了
      return
    }
    if (cb) {
      // watch(source, cb)
      const newValue = runner() // 最新值
      if (deep || forceTrigger || hasChanged(newValue, oldValue)) {
        // 执行 cb 之前先清理 effect，这里如果 cleanup 有值说明是非首次执行
        if (cleanup) {
          cleanup()
        }
        // 回调参数:watch(fn, (newV, oldV, onInvalidate) => {...})
        callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
          newValue,
          oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
          onInvalidate
        ])
        oldValue = newValue
      }
    } else {
      // watchEffect
      runner()
    }
  }

  // important: mark the job as a watcher callback so that scheduler knows
  // it is allowed to self-trigger (#1727)
  job.allowRecurse = !!cb

  let scheduler: ReactiveEffectOptions['scheduler']
  if (flush === 'sync') {
    // scheduler = job
  } else if (flush === 'post') {
    // TODO
  } else {
    // default: 'pre'
    scheduler = () => {
      if (!instance || instance.isMounted) {
        // 放到队列执行
        queuePreFlushCb(job)
      } else {
        // with 'pre' option, the first call must happen before
        // the component is mounted so it is called synchronously.
        job()
      }
    }
  }

  const runner = effect(getter, {
    lazy: true,
    onTrack,
    onTrigger,
    scheduler
  })

  recordInstanceBoundEffect(runner, instance)

  // initial run
  if (cb) {
    if (immediate) {
      job()
    } else {
      oldValue = runner()
    }
  } else if (flush === 'post') {
    // TODO
  } else {
    runner()
  }

  return () => {
    stop(runner)
    if (instance) {
      remove(instance.effects!, runner)
    }
  }
}

function traverse(value: unknown, seen: Set<unknown> = new Set()) {
  // TODO
}
