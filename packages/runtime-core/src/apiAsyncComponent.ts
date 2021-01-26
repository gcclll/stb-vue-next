import { isFunction, isObject } from '@vue/shared'
import { ref } from '@vue/reactivity'
import { defineComponent } from './apiDefineComponent'
import {
  Component,
  ComponentInternalInstance,
  ComponentOptions,
  ConcreteComponent,
  currentInstance
} from './component'
import { ComponentPublicInstance } from './componentPublicInstance'
import { ErrorCodes, handleError } from './errorHandling'
import { createVNode, VNode } from './vnode'
import { warn } from './warning'

export type AsyncComponentResolveResult<T = Component> = T | { default: T } // es modules

export type AsyncComponentLoader<T = any> = () => Promise<
  AsyncComponentResolveResult<T>
>

export interface AsyncComponentOptions<T = any> {
  loader: AsyncComponentLoader<T>
  loadingComponent?: Component
  errorComponent?: Component
  delay?: number
  timeout?: number
  suspensible?: boolean
  onError?: (
    error: Error,
    retry: () => void,
    fail: () => void,
    attempts: number
  ) => any
}

export const isAsyncWrapper = (i: ComponentInternalInstance | VNode) =>
  !!(i.type as ComponentOptions).__asyncLoader

export function defineAsyncComponent<
  T extends Component = { new (): ComponentPublicInstance }
>(source: AsyncComponentLoader<T> | AsyncComponentOptions<T>): T {
  // 1. TODO retry 封装
  //
  // 2. TODO 函数封装
  //
  // 3. TODO 返回组件
  return defineComponent({} as any) as any
}
