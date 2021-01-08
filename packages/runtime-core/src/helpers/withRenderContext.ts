import { ComponentInternalInstance } from '../component'
import { currentRenderingInstance } from '../componentRenderUtils'
import { Slot } from '../componentSlots'

/**
 * Wrap a slot function to memoize current rendering instance
 * @private
 */
export function withCtx(
  fn: Slot,
  ctx: ComponentInternalInstance | null = currentRenderingInstance
) {
  // TODO
}
