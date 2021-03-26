import {
  Component,
  ConcreteComponent,
  currentInstance,
  ComponentInternalInstance,
  isInSSRComponentSetup,
  ComponentOptions
} from './component'
import { isFunction, isObject } from '@vue/shared'
import { ComponentPublicInstance } from './componentPublicInstance'
import { createVNode, VNode } from './vnode'
import { defineComponent } from './apiDefineComponent'
import { warn } from './warning'
import { ref } from '@vue/reactivity'
import { handleError, ErrorCodes } from './errorHandling'

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

export const isAsyncWrapper = (i: ComponentInternalInstance | VNode): boolean =>
  !!(i.type as ComponentOptions).__asyncLoader

export function defineAsyncComponent<
  T extends Component = { new (): ComponentPublicInstance }
>(source: AsyncComponentLoader<T> | AsyncComponentOptions<T>): T {
  if (isFunction(source)) {
    source = { loader: source }
  }

  const { loader, loadingComponent, delay = 200, timeout } = source

  // 1. TODO retry 封装
  let pendingRequest: Promise<ConcreteComponent> | null = null
  let resolvedComp: ConcreteComponent | undefined

  // let retries = 0 // 重试次数
  // const retry = () => {
  //   retries++
  //   pendingRequest = null
  //   return load()
  // }

  // 2. TODO 函数封装
  const load = (): Promise<ConcreteComponent> => {
    let thisRequest: Promise<ConcreteComponent>
    return (
      pendingRequest ||
      (thisRequest = pendingRequest = loader()
        .catch(err => {
          // TODO, 组件加载异常
          console.log('\nasync comp load error', thisRequest)
        })
        .then((comp: any) => {
          // TODO, 组件正常加载
          console.log('\nasync comp load ok, ', comp())
          // 1. TODO thisRequest 非当前 pendingRequest
          // 2. TODO 没有 comp 情况，非法组件
          // 3. TODO es6 export default 模块语法
          // 4. TODO 非法组件，只能是函数或对象
          resolvedComp = comp
          return comp
        }))
    )
  }
  //
  // 3. TODO 返回组件
  return defineComponent({
    __asyncLoader: load,
    name: 'AsyncComponentWrapper',
    setup() {
      const instance = currentInstance!

      console.log('\n resolved comp before')
      // 异步组件已经完成了
      if (resolvedComp) {
        console.log('\n resolved comp')
        return createInnerComp(resolvedComp!, instance)
      }

      // const onError = (err: Error) => {
      //   // TODO
      //   console.log('\nasync comp load err', err.message)
      // }

      // TODO suspense-controlled or SSR

      const loaded = ref(false)
      // const error = ref()
      const delayed = ref(!!delay)

      if (delay) {
        setTimeout(() => {
          delayed.value = false
        }, delay)
      }

      if (timeout != null) {
        // TODO 超时机制
      }

      // 开始执行异步任务加载异步组件
      load()
        .then(() => {
          loaded.value = true
        })
        .catch(err => {
          // TODO
          console.log('loading error')
        })

      return () => {
        console.log('loaded.value = ', loaded.value)
        if (loaded.value && resolvedComp) {
          // 组件正常加载完成
          return createInnerComp(resolvedComp, instance)
        } else if (false) {
          // TODO error
        } else if (loadingComponent && !delayed.value) {
          // TODO
        }
      }
    }
  }) as any
}

function createInnerComp(
  comp: ConcreteComponent,
  { vnode: { ref, props, children } }: ComponentInternalInstance
) {
  const vnode = createVNode(comp, props, children)
  // ensure inner component inherits the async wrapper's ref owner
  vnode.ref = ref
  return vnode
}
