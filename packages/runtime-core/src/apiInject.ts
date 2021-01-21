import { isFunction } from '@vue/shared'
import { currentInstance } from './component'
import { currentRenderingInstance } from './componentRenderUtils'
import { warn } from './warning'

export interface InjectionKey<T> extends Symbol {}

export function provide<T>(key: InjectionKey<T> | string | number, value: T) {
  if (!currentInstance) {
    if (__DEV__) {
      warn(`provide() can only be used inside setup().`)
    }
  } else {
    let provides = currentInstance.provides

    // 默认情况实例会继承它父亲的 provides 对象
    // 但是当它需要 provide 自己的 values 时候，那么使用它
    // 父亲的 provides 作为原型创建一个新的对象出来变成自己的 provides
    // 这样在 `inject` 里面可以简便的从原型链中查找 injections
    // 简单说就是：
    // 1. 需要自己的就创建个新的对象继承自 Parent provides
    // 2. 这样在查找的时候就可以含方便的通过原型链查找 injections
    const parentProvides =
      currentInstance.parent && currentInstance.parent.provides

    // 当父组件和当前实例相同的时候，从父组件的 provides 创建一个备份出来
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides)
    }

    // TS doesn't allow symbol as index type
    provides[key as string] = value
  }
}

export function inject<T>(key: InjectionKey<T> | string): T | undefined
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T,
  treatDefaultAsFactory?: false
): T
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T | (() => T),
  treatDefaultAsFactory: true
): T

export function inject(
  key: InjectionKey<any> | string,
  defaultValue?: unknown,
  treatDefaultAsFactory = false
) {
  // currentRenderingInstance 兼容函数式组件
  const instance = currentInstance || currentRenderingInstance
  if (instance) {
    // #2400
    // to support `app.use` plugins,
    // fallback to appContext's `provides` if the intance is at root
    const provides =
      instance.parent == null // root
        ? instance.vnode.appContext && instance.vnode.appContext.provides
        : instance.parent.provides

    if (provides && (key as string | symbol) in provides) {
      // TS doesn't allow symbol as index type
      return provides[key as string]
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue)
        ? defaultValue()
        : defaultValue
    } else if (__DEV__) {
      warn(`injection "${String(key)}" not found.`)
    }
  } else if (__DEV__) {
    warn(`inject() can only be used inside setup() or functional components.`)
  }
}
