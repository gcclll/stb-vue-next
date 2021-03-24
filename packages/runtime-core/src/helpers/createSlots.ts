import { Slot } from '../componentSlots'
import { isArray } from '@vue/shared'

interface CompiledSlotDescriptor {
  name: string
  fn: Slot
}

/**
 * Compiler runtime helper for creating dynamic slots object
 * @private
 */
export function createSlots(
  slots: Record<string, Slot>,
  dynamicSlots: (
    | CompiledSlotDescriptor
    | CompiledSlotDescriptor[]
    | undefined)[]
): Record<string, Slot> {
  for (let i = 0; i < dynamicSlots.length; i++) {
    const slot = dynamicSlots[i]
    // 数组动态插槽由  <template v-for="..." #[...]> 生成
    // 经过编译后的 slots: [{ name:'default', fn: ... }]
    if (isArray(slot)) {
      for (let j = 0; j < slot.length; j++) {
        slots[slot[j].name] = slot[j].fn
      }
    } else if (slot) {
      // 条件语句生成的 slot 如 <template v-if="..." #foo>
      slots[slot.name] = slot.fn
    }
  }
  return slots
}
