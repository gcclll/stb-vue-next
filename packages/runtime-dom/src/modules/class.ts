// 编译阶段应该将 class + :class 静态动态的绑定，编译进一个绑定
// ['staticClass', dynamic]，其实就是合并
export function patchClass(el: Element, value: string | null, isSVG: boolean) {
  if (value == null) {
    value = ''
  }

  if (isSVG) {
    el.setAttribute('class', value)
  } else {
    const transitionClasses = (el as any) /* TODO ElementWithTransition */._vtc
    if (transitionClasses) {
      // 合并类名
      value = (value
        ? [value, ...transitionClasses]
        : [...transitionClasses]
      ).join('')
    }
    el.className = value
  }
}
