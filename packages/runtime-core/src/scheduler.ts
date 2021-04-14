import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import { isArray } from '@vue/shared'
import { ComponentPublicInstance } from './componentPublicInstance'

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
   * 这个大概意思就是允许当前的 Job/cb 在执行期间调用对应的 queue 入列函数将自己
   * 加入到当前执行队列，这样如果处理不好容易造成死循环。
   * 而调度器的实现是根据索引来查找是否重复做的入列操作，因为这种使用方式有一点是可以肯定的：
   * 那就是 cb 中 queue 新的 cb 时候，那么这个新的 cb 任务在 index+1 位置肯定找不到
   * 如：检测代码 includes(allowRecurse ? index + 1 : index)
   * 这样同一个 cb 就能继续进行入列操作而得到：
   * [cb] -> 查找重复，index + 1 -> 找不到 -> 重复入列 -> [cb, cb]
   */
  allowRecurse?: boolean
}

export type SchedulerCb = Function & { id?: number }
export type SchedulerCbs = SchedulerCb | SchedulerCb[]

let isFlushing = false // 开始 flush pre/job/post
let isFlushPending = false // 正在 flush pre cbs

// job
const queue: SchedulerJob[] = [] // job 队列
let flushIndex = 0 // for -> job 时候的索引

// 默认 pre cb 队列
const pendingPreFlushCbs: SchedulerCb[] = []
// 正在执行的 pre cbs，由 pendingPreFlushCbs 去重而来的任务队列
let activePreFlushCbs: SchedulerCb[] | null = null
let preFlushIndex = 0

// post 类型的 cb 队列
const pendingPostFlushCbs: SchedulerCb[] = []
// 当前正在执行的 post cbs 队列，由 pendingPostFlushCbs 去重而来
// 且它不会执行期间进行扩充，而是在 flushJobs 中 queue jobs 执行完成之后
// 的 finally 里面检测 post 队列重新调用 flushJobs 来清空
let activePostFlushCbs: SchedulerCb[] | null = null
let postFlushIndex = 0

// 空的 Promise 用来进行异步化，实现 nextTick
const resolvedPromise: Promise<any> = Promise.resolve()
// 当 flushJobs 执行完毕，即当 pre/job/post 队列中所有
// 任务都完成之后返回的一个 promise ，所以当使用 nextTick()
// 的时候，对应的代码都是在这个基础完成之后调用
// 所以 nextTick() 顾名思义就是在当前的 tick 下所有任务(pre/job/post)都
// 执行完毕之后才执行的代码
let currentFlushPromise: Promise<void> | null = null

// queue job 可以作为 pre cbs 的父级任务
// 比如：在手动调用 flushPreFlushCbs(seen, parentJob) 就可以
// 传一个 queue job 当做当前 cbs 的父级任务。
// 这个用途是为了避免该 job 的上一次入列任务(包括 job 及其子 pre cbs)
// 还没完成就再次调用 queueJob 重复入列, 说白了就是为了同一个 job 不能在
// parentJob 完成之前调用 queueJob，就算调了也没用
let currentPreFlushParentJob: SchedulerJob | null = null

// pre/job/post 三种任务在同一个 tick 下，一次执行上限是100个
// 超出视为死循环
const RECURSION_LIMIT = 100
type CountMap = Map<SchedulerJob | SchedulerCb, number>

// 这个函数将使得 fn 或使用了 await 时候后面的代码总是在
// 当前 tick 下的 pre/job/post 队列都 flush 空了之后执行
export function nextTick(
  this: ComponentPublicInstance | void,
  fn?: () => void
): Promise<void> {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}

export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  // 1. 队列为空或不包含当前正入列的 job
  // 2. job 非当前 parent job
  if (
    (!queue.length ||
      !queue.includes(
        job,
        isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex
      )) &&
    job !== currentPreFlushParentJob
  ) {
    queue.push(job)
    queueFlush()
  }
}

// 立即启动异步 flush 操作
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

// 失效一个任务就是将其删除
export function invalidateJob(job: SchedulerJob) {
  const i = queue.indexOf(job)
  if (i > -1) {
    queue.splice(i, 1)
  }
}

// pre/post 任务入列函数，注意点
// 1. 不能重复添加同一个 cb
// 2. 如果指定了 allowRecurse: true 是可以重复添加的
// 如下面的实现，查找从 index+1 开始肯定是找不到的
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
    // 如果 cb 是个数组，那么它是个组件生命周期的 Hook 函数，这些函数只能被
    // 一个 job 触发，且在对应的 queue flush 函数中进过了去重操作
    // 因为这里直接跳过去重检测提高性能
    // 意思就是，在 flush[Pre|Post]FlushCbs 函数执行期间会进行去重操作，
    // 因此这里不需要重复做(如： activePostFlushCbs, activePreFlushCbs 都是
    // 去重之后待执行的 cbs)
    pendingQueue.push(...cb)
  }
  queueFlush()
}

export function queuePreFlushCb(cb: SchedulerCb) {
  queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex)
}

export function queuePostFlushCb(cb: SchedulerCbs) {
  queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex)
}

// flush pre cbs，在 flushJobs 中优先调用，也就是说 pre cbs
// 在同一 tick 内执行优先级最高，即最先执行(pre cbs > job > post cbs)
// 并且它会一直递归到没有新的 pre cbs 为止
// 比如： 有10个任务，执行到第5个的时候来了个新的任务(queuePreFlushCb(cb))
// 那么这个任务会在前面10个执行完成之后作为第 11 个去执行，但记住是下次递归时完成
export function flushPreFlushCbs(
  seen?: CountMap,
  parentJob: SchedulerJob | null = null
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
      // 检查递归更新问题
      if (__DEV__) {
        checkRecursiveUpdates(seen!, activePreFlushCbs[preFlushIndex])
      }
      activePreFlushCbs[preFlushIndex]()
    }

    activePreFlushCbs = null
    preFlushIndex = 0
    currentPreFlushParentJob = null
    // 递归 flush 直到所有 pre jobs 被执行完成
    flushPreFlushCbs(seen, parentJob)
  }
}

// flush post cbs 和 pre cbs 差不多，唯一不同的点在于：
// 如果执行期间有新的任务进来 (queuePostFlushCb(cb)) 的时候
// 它不是在当前 post cbs 后面立即执行，而是当 pre cbs -> jobs -> post -cbs
// 执行完一轮之后在 flushJobs 的 finally 中重启新一轮的 flushJobs
// 所以，这期间如果有新的 pre cbs 或 Jobs 那么这两个都会在新的 post cbs
// 之前得到执行
export function flushPostFlushCbs(seen?: CountMap) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)]
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }

    activePostFlushCbs = deduped
    if (__DEV__) {
      seen = seen || new Map()
    }

    activePostFlushCbs.sort((a, b) => getId(a) - getId(b))

    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      // 递归 update 检查
      if (__DEV__) {
        checkRecursiveUpdates(seen!, activePostFlushCbs[postFlushIndex])
      }
      activePostFlushCbs[postFlushIndex]()
    }

    activePostFlushCbs = null
    postFlushIndex = 0
  }
}

const getId = (job: SchedulerJob | SchedulerCb) =>
  job.id == null ? Infinity : job.id

// 开启三种任务 flush 操作，优先级 pre cbs > jobs > post cbs
function flushJobs(seen?: CountMap) {
  isFlushPending = false
  isFlushing = true

  if (__DEV__) {
    seen = seen || new Map()
  }

  flushPreFlushCbs(seen) // 默认的 job 类型

  // flush 之前对 queue 排序
  // 1. 组件更新顺序：parent -> child，因为 parent 总是在 child 之前
  //    被创建，因此 parent render effect 有更低的优先级数字(数字越小越先创建？)
  // 2. 如果组件在 parent 更新期间被卸载了，那么它的更新都会被忽略掉

  queue.sort((a, b) => getId(a) - getId(b))

  // 开始 flush
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        // 检查递归更新问题
        if (__DEV__) {
          checkRecursiveUpdates(seen!, job)
        }
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    // 情况队列
    flushIndex = 0
    queue.length = 0

    // flush `post` 类型的 flush cbs
    flushPostFlushCbs(seen)

    isFlushing = false
    currentFlushPromise = null

    // 代码执行到当前 tick 的时候，有可能有新的 job 加入
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}

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
