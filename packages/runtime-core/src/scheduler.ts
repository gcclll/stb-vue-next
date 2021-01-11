import { isArray } from '@vue/shared/src'
import { ComponentPublicInstance } from './componentPublicInstance'
import { callWithErrorHandling, ErrorCodes } from './errorHandling'

export interface SchedulerJob {
  (): void
  /**
   * unique job id, only present on raw effects, e.g. component render effect
   */
  id?: number
  /**
   * Indicates whether the job is allowed to recursively trigger itself.
   * By default, a job cannot trigger itself because some built-in method calls,
   * e.g. Array.prototype.push actually performs reads as well (#1740) which
   * can lead to confusing infinite loops.
   * The allowed cases are component update functions and watch callbacks.
   * Component update functions may update child component props, which in turn
   * trigger flush: "pre" watch callbacks that mutates state that the parent
   * relies on (#1801). Watch callbacks doesn't track its dependencies so if it
   * triggers itself again, it's likely intentional and it is the user's
   * responsibility to perform recursive state mutation that eventually
   * stabilizes (#1727).
   */
  allowRecurse?: boolean
}

export type SchedulerCb = Function & { id?: number }
export type SchedulerCbs = SchedulerCb | SchedulerCb[]

let isFlushing = false
let isFlushPending = false

const queue: SchedulerJob[] = []
let flushIndex = 0

const pendingPreFlushCbs: SchedulerCb[] = []
let activePreFlushCbs: SchedulerCb[] | null = null
let preFlushIndex = 0

const pendingPostFlushCbs: SchedulerCb[] = []
let activePostFlushCbs: SchedulerCb[] | null = null
let postFlushIndex = 0

const resolvedPromise: Promise<any> = Promise.resolve()
let currentFlushPromise: Promise<void> | null = null

let currentPreFlushParentJob: SchedulerJob | null = null

const RECURSION_LIMIT = 100
type CountMap = Map<SchedulerJob | SchedulerCb, number>

function queueFlush() {
  if (!isFlushing || !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

export function nextTick(
  this: ComponentPublicInstance | void,
  fn?: () => void
) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}

function queueCb(
  cb: SchedulerCbs,
  activeQueue: SchedulerCb[] | null,
  pendingQueue: SchedulerCb[],
  index: number
) {
  if (!isArray(cb)) {
    if (
      !activeQueue ||
      !activeQueue.includes(
        cb,
        (cb as SchedulerJob).allowRecurse ? index + 1 : index
      )
    ) {
      pendingQueue.push(cb)
    }
  } else {
    // TODO cb is array
  }
  // 刷新队列
  queueFlush()
}

const getId = (job: SchedulerJob | SchedulerCb) =>
  job.id == null ? Infinity : job.id

export function queuePreFlushCb(cb: SchedulerCb) {
  queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex)
}

export function flushPreFlushCbs(
  seen?: CountMap,
  parentJob: SchedulerCb | null = null
) {
  if (pendingPreFlushCbs.length) {
    currentPreFlushParentJob = parentJob
    activePreFlushCbs = [...new Set(pendingPreFlushCbs)]
    pendingPreFlushCbs.length = 0
    if (__DEV__) {
      seen = seen || new Map()
    }
    for (
      preFlushIndex = 0;
      preFlushIndex < activePreFlushCbs.length;
      preFlushIndex++
    ) {
      if (__DEV__) {
        checkRecursiveUpdates(seen!, activePreFlushCbs[preFlushIndex])
      }
      activePreFlushCbs[preFlushIndex]()
    }
    activePreFlushCbs = null
    preFlushIndex = 0
    currentPreFlushParentJob = null
    // 递归 flush 直到所有任务都完成了
    flushPreFlushCbs(seen, parentJob)
  }
}

function flushJobs(seen?: CountMap) {
  isFlushPending = false
  isFlushing = true
  if (__DEV__) {
    seen = seen || new Map()
  }

  // flush pre cbs
  flushPreFlushCbs(seen)

  // Sort queue before flush，在 flush 之前进行队列排序
  // This ensures that: 确保
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 更新顺序： parent -> child，因为 parent 总是在 child 之前被创建，因此
  // 它的 effect 有更低的优先级
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // 如果 child 在 parent 更新期间被卸载了，该组件的更新会被忽略掉
  queue.sort((a, b) => getId(a) - getId(b))

  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        if (__DEV__) {
          checkRecursiveUpdates(seen!, job)
        }

        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    // 重置队列
    flushIndex = 0
    queue.length = 0

    // TODO flush post cbs

    isFlushing = false
    currentFlushPromise = null
    // TODO
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
  }
}

// 死循环了
function checkRecursiveUpdates(seen: CountMap, fn: SchedulerJob | SchedulerCb) {
  if (!seen.has(fn)) {
    seen.set(fn, 1)
  } else {
    const count = seen.get(fn)!
    if (count > RECURSION_LIMIT) {
      throw new Error(
        `Maximum recursive updates exceeded. ` +
          `This means you have a reactive effect that is mutating its own ` +
          `dependencies and thus recursively triggering itself. Possible sources ` +
          `include component template, render function, updated hook or ` +
          `watcher source function.`
      )
    } else {
      seen.set(fn, count + 1)
    }
  }
}
