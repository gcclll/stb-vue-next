import {
  getCurrentInstance,
  onMounted,
  warn,
  VNode,
  Fragment,
  onUpdated,
  watchEffect
} from '@vue/runtime-core'
import { ShapeFlags } from '@vue/shared'

/**
 * Runtime helper for SFC's CSS variable injection feature.
 * vue 文件中的样式，CSS变量注入特性， color: v-bind(fontColor)
 * @private
 */
export function useCssVars(getter: (ctx: any) => Record<string, string>) {
  if (!__BROWSER__ && !__TEST__) return
  const instance = getCurrentInstance()
  if (!instance) {
    __DEV__ &&
      warn(`useCssVars is called without current active component instance.`)
    return
  }

  const setVars = () =>
    setVarsOnVNode(instance.subTree, getter(instance.proxy!))
  onMounted(() => watchEffect(setVars, { flush: 'post' }))
  onUpdated(setVars)
}

function setVarsOnVNode(vnode: VNode, vars: Record<string, string>) {
  if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
    const suspense = vnode.suspense!
    vnode = suspense.activeBranch!
    if (suspense.pendingBranch && !suspense.isHydrating) {
      // 在 runtime-dom 中分析过  effects 会等到
      // 异步请求完成之后并且是在 parent.effects 没有任务的情况下才会
      // 执行，这里将 CSS 的处理加入到组件 effect 队列等待所以
      // 异步结束再处理样式
      suspense.effects.push(() => {
        setVarsOnVNode(suspense.activeBranch!, vars)
      })
    }
  }

  // drill down HOCs until it's a non-component vnode
  // 找到最内层的非组件的子树节点
  while (vnode.component) {
    vnode = vnode.component.subTree
  }

  if (vnode.shapeFlag & ShapeFlags.ELEMENT && vnode.el) {
    const style = vnode.el.style
    for (const key in vars) {
      style.setProperty(`--${key}`, vars[key])
    }
  } else if (vnode.type === Fragment) {
    // 如果是个占位 fragment 直接给 children 设置
    ;(vnode.children as VNode[]).forEach(c => setVarsOnVNode(c, vars))
  }
}
