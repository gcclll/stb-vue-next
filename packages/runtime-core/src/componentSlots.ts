import { SlotFlags } from '@vue/shared'
import { isHmrUpdating } from './hmr'
import { ComponentInternalInstance } from './component'
import {
  VNodeChild,
  normalizeVNode,
  InternalObjectKey,
  VNode,
  VNodeNormalizedChildren
} from './vnode'
import {
  isArray,
  isFunction,
  EMPTY_OBJ,
  ShapeFlags,
  extend,
  def,
  SlotFlags
} from '@vue/shared'
import { withCtx } from './helpers/withRenderContext'

export type Slot = (...args: any[]) => VNode[]

export type InternalSlots = {
  [name: string]: Slot | undefined
}

export type Slots = Readonly<InternalSlots>

export type RawSlots = {
  [name: string]: unknown
  // manual render fn hint to skip forced children updates
  $stable?: boolean
  /**
   * for tracking slot owner instance. This is attached during
   * normalizeChildren when the component vnode is created.
   * @internal
   */
  _ctx?: ComponentInternalInstance | null
  /**
   * indicates compiler generated slots
   * we use a reserved property instead of a vnode patchFlag because the slots
   * object may be directly passed down to a child component in a manual
   * render function, and the optimization hint need to be on the slot object
   * itself to be preserved.
   * @internal
   */
  _?: SlotFlags
}

const isInternalKey = (key: string) => key[0] === '_' || key === '$stable'

const normalizeSlotValue = (value: unknown): VNode[] =>
  isArray(value)
    ? value.map(normalizeVNode)
    : [normalizeVNode(value as VNodeChild)]

const normalizeSlot = (
  key: string,
  rawSlot: Function,
  ctx: ComponentInternalInstance | null | undefined
): Slot =>
  withCtx((props: any) => {
    // warn: 在 Render 函数外执行了 slot function
    return normalizeSlotValue(rawSlot(props))
  }, ctx)

const normalizeObjectSlots = (rawSlots: RawSlots, slots: InternalSlots) => {
  const ctx = rawSlots._ctx
  for (const key in rawSlots) {
    if (isInternalKey(key)) {
      continue
    }
    const value = rawSlots[key]
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx)
    } else if (value != null) {
      // warn: 使用 function slots 性能更好
      const normalized = normalizeSlotValue(value)
      slots[key] = () => normalized
    }
  }
}

const normalizeVNodeSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren
) => {
  const normalized = normalizeSlotValue(children)
  instance.slots.default = () => normalized
}

export const initSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren
) => {
  if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    const type = (children as RawSlots)._
    if (type) {
      instance.slots = children as InternalSlots
      // make compiler marker non-enumerable
      def(children as InternalSlots, '_', type)
    } else {
      normalizeObjectSlots(children as RawSlots, (instance.slots = {}))
    }
  } else {
    instance.slots = {}
    if (children) {
      normalizeVNodeSlots(instance, children)
    }
  }
  def(instance.slots, InternalObjectKey, 1)
}

export const updateSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren
) => {
  const { vnode, slots } = instance
  let needDeletionCheck = true
  let deletionComparisonTarget = EMPTY_OBJ
  if (vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    const type = (children as RawSlots)._
    if (type) {
      // compiled slots.
      if (__DEV__ && isHmrUpdating) {
        // TODO
      } else if (type === SlotFlags.STABLE) {
        // compiled AND stable
        // 不需要更新，跳过 slots 删除操作
        needDeletionCheck = false
      } else {
        // compiled but dynamic (v-if/v-for on slots)
        // update slots, but skip normalization
        extend(slots, children as Slots)
      }
    } else {
      needDeletionCheck = !(children as RawSlots).$stable
      normalizeObjectSlots(children as RawSlots, slots)
    }
    deletionComparisonTarget = children as RawSlots
  } else if (children) {
    // non slot object children (direct value)
    // passed to a component
    normalizeVNodeSlots(instance, children)
    deletionComparisonTarget = { default: 1 }
  }

  // delete stale slots
  // 删除旧的 slots
  if (needDeletionCheck) {
    for (const key in slots) {
      // 非 `_` 内部插槽，且不再新的 children 中的
      if (!isInternalKey(key) && !(key in deletionComparisonTarget)) {
        delete slots[key]
      }
    }
  }
}
