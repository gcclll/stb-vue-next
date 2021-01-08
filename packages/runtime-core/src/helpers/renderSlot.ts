export let isRenderingCompiledSlot = 0
export const setCompiledSlotRendering = (n: number) =>
  (isRenderingCompiledSlot += n)
