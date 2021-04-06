import {
  ConcreteComponent,
  getCurrentInstance,
  SetupContext,
  ComponentInternalInstance,
  LifecycleHooks,
  currentInstance,
  getComponentName
} from '../component'
import { VNode, cloneVNode, isVNode, VNodeProps } from '../vnode'
import { warn } from '../warning'
import {
  onBeforeUnmount,
  injectHook,
  onUnmounted,
  onMounted,
  onUpdated
} from '../apiLifecycle'
import {
  isString,
  isArray,
  ShapeFlags,
  remove,
  invokeArrayFns
} from '@vue/shared'
import { watch } from '../apiWatch'
import {
  RendererInternals,
  queuePostRenderEffect,
  MoveType,
  RendererElement,
  RendererNode,
  invokeVNodeHook
} from '../renderer'
import { setTransitionHooks } from './BaseTransition'
import { ComponentRenderContext } from '../componentPublicInstance'

type MatchPattern = string | RegExp | string[] | RegExp[]

export interface KeepAliveProps {
  include?: MatchPattern
  exclude?: MatchPattern
  max?: number | string
}

type CacheKey = string | number | ConcreteComponent
type Cache = Map<CacheKey, VNode>
type Keys = Set<CacheKey>

export interface KeepAliveContext extends ComponentRenderContext {
  renderer: RendererInternals
  activate: (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    isSVG: boolean,
    optimized: boolean
  ) => void
  deactivate: (vnode: VNode) => void
}

export const isKeepAlive = (vnode: VNode): boolean =>
  (vnode.type as any).__isKeepAlive

const KeepAliveImpl = {
  name: `KeepAlive`,

  __isKeepAlive: true,

  inheritRef: true,

  props: {
    include: [String, RegExp, Array],
    exclude: [String, RegExp, Array],
    max: [String, Number]
  },

  setup(props: KeepAliveProps, { slots }: SetupContext) {
    const cache: Cache = new Map()
    const keys: Keys = new Set()
    let current: VNode | null = null

    const instance = getCurrentInstance()!
    const parentSuspense = instance.suspense

    const sharedContext = instance.ctx as KeepAliveContext
    const {
      renderer: {
        p: patch,
        m: move,
        um: _unmount,
        o: { createElement }
      }
    } = sharedContext
    const storageContainer = createElement('div')

    sharedContext.activate = (vnode, container, anchor, isSVG, optimized) => {
      const instance = vnode.component!
      move(vnode, container, anchor, MoveType.ENTER, parentSuspense)
      // props 可能发生变化，这里执行一次 patch 操作
      patch(
        instance.vnode,
        vnode,
        container,
        anchor,
        instance,
        parentSuspense,
        isSVG,
        optimized
      )
      queuePostRenderEffect(() => {
        instance.isDeactivated = false
        if (instance.a) {
          // activated 周期函数
          invokeArrayFns(instance.a)
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeMounted
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance.parent, vnode)
        }
      }, parentSuspense)
    }

    sharedContext.deactivate = (vnode: VNode) => {
      const instance = vnode.component!
      move(vnode, storageContainer, null, MoveType.LEAVE, parentSuspense)
      queuePostRenderEffect(() => {
        if (instance.da) {
          invokeArrayFns(instance.da)
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance.parent, vnode)
        }
        instance.isDeactivated = true
      }, parentSuspense)
    }

    // 对 renderer unmount 的一次封装
    function unmount(vnode: VNode) {
      resetShapeFlag(vnode)
      _unmount(vnode, instance, parentSuspense)
    }

    // 过滤掉缓存
    function pruneCache(filter?: (name: string) => boolean) {
      cache.forEach((vnode, key) => {
        const name = getComponentName(vnode.type as ConcreteComponent)
        if (name && (!filter || !filter(name))) {
          pruneCacheEntry(key)
        }
      })
    }

    function pruneCacheEntry(key: CacheKey) {
      const cached = cache.get(key) as VNode
      if (!current || cached.type !== current.type) {
        // 新增或节点类型发生变化，直接卸载掉老的
        unmount(cached)
      } else if (current) {
        // 重置标记就可以了？
        // 当前激活的实例不该再是 kept-alive
        // 我们不能立即卸载但是稍后会进行卸载，所以这里先重置其标记
        // 不能立即卸载？
        // 是因为在 activate 和 deactivate 中的周期函数调用
        // 是采用的 post 类型异步执行的缘故吗？
        resetShapeFlag(current)
      }
      cache.delete(key)
      keys.delete(key)
    }

    // 监听 include/exclude 属性变化
    watch(
      () => [props.include, props.exclude],
      ([include, exclude]) => {
        // 支持三种类型
        // 1. 字符串, 'a,b,c'
        // 2. 正则表达式， /a|b|c/
        // 3. 数组， ['a', 'b', 'c', /d/, /e|f/]
        include && pruneCache(name => matches(include, name))
        exclude && pruneCache(name => !matches(exclude, name))
      },
      { flush: 'post', deep: true }
    )

    // 在 render 之后缓存子树(subTree)
    let pendingCacheKey: CacheKey | null = null
    const cacheSubtree = () => {
      if (pendingCacheKey != null) {
        cache.set(pendingCacheKey, getInnerChild(instance.subTree))
      }
    }
    // 注册生命周期
    onMounted(cacheSubtree)
    onUpdated(cacheSubtree)

    onBeforeUnmount(() => {
      cache.forEach(cached => {
        const { subTree, suspense } = instance
        const vnode = getInnerChild(subTree)
        if (cached.type === vnode.type) {
          // 有缓存的节点
          // 当前实例会成为 keep-alive 的 unmount 一部分
          resetShapeFlag(vnode)
          // 但是在这里执行它的 deactivated 钩子函数
          const da = vnode.component!.da
          da && queuePostRenderEffect(da, suspense)
          return
        }
        // 没有缓存的直接 unmount
        unmount(cached)
      })
    })
    return () => {
      // 根据组件的执行流程，这个函数将会在 setupComponent() 中
      // 执行 setup() 得到 setupResult ，传递给 handleSetupResult()
      // 函数，这里面检测 setupResult 也就是这个匿名函数，如果它是函数
      // 会直接被当做 render 函数处理(instance.render 或 instance.ssrRender)
      // 结论就是，这个匿名函数是 render() 函数

      pendingCacheKey = null
      if (!slots.default) {
        // 组件支持默认插槽使用方式
        return null
      }

      const children = slots.default()
      const rawVNode = children[0]
      if (children.length > 1) {
        // KeepAlive 组件只能包含一个组件作为 child
        // 也就是说 ~<keep-alive><CompA/><CompB/></keep-alive/>~
        // 是不合法的使用
        current = null
        // warn...
        return children
      } else if (
        !isVNode(rawVNode) ||
        (!(rawVNode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) &&
          !(rawVNode.shapeFlag & ShapeFlags.SUSPENSE))
      ) {
        // 1. 非 VNode 类型节点
        // 2. 既不是有状态组件(对象类型组件)也不是 Suspense 的时候
        // 相反意味着，节点必须满足下面几种情况
        // 1. 是 VNode 类型且是有状态组件(非函数式组件)
        // 2. 或者是 VNode 类型且是Suspense 组件
        current = null
        return rawVNode
      }

      // 也就是说 keep-alive 只接受有状态组件或者 Suspense 作为唯一的 child
      let vnode = getInnerChild(rawVNode)
      const comp = vnode.type as ConcreteComponent
      const name = getComponentName(comp)
      const { include, exclude, max } = props

      if (
        // 无缓存的节点
        (include && (!name || !matches(include, name))) ||
        // 在不缓存的节点们之列
        (exclude && name && matches(exclude, name))
      ) {
        current = vnode
        return rawVNode
      }

      const key = vnode.key == null ? comp : vnode.key
      const cachedVNode = cache.get(key)

      // 克隆一份如果它有被复用的话，因为我们即将修改它
      if (vnode.el) {
        vnode = cloneVNode(vnode)
        if (rawVNode.shapeFlag & ShapeFlags.SUSPENSE) {
          rawVNode.ssContent = vnode
        }
      }

      pendingCacheKey = key

      if (cachedVNode) {
        vnode.el = cachedVNode.el
        vnode.component = cachedVNode.component
        if (vnode.transition) {
          // 在 subTree 上递归更新 transition 钩子函数
          setTransitionHooks(vnode, vnode.transition!)
        }

        // 避免 vnode 正在首次 mount
        vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE
        // 标记 key 为最新的
        keys.delete(key)
        keys.add(key)
      } else {
        // 没有缓存的情况
        keys.add(key)
        // 删除最老的 entry，缓冲池已经满了，删除掉最老的那个
        if (max && keys.size > parseInt(max as string, 10)) {
          // 因为 Set 没有直接取指定位置元素的值
          // 这里的目的是变相的取 Set 中第一个元素，即最早 add 的那个 key
          // 如： new Set([1,2,3,4]) => keys.values() => <1,2,3,4>
          // next() 得到迭代器下一个值 { value: 1, done: false }
          // .value 得到第一个集合元素的值
          pruneCacheEntry(keys.values().next().value)
        }
      }

      // 避免 vnode 正在被卸载，在renderer unmount 中会检测
      vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE

      current = vnode

      return rawVNode
    }
  }
}

export const KeepAlive = (KeepAliveImpl as any) as {
  __isKeepAlive: true
  new (): {
    $props: VNodeProps & KeepAliveProps
  }
}

function matches(pattern: MatchPattern, name: string): boolean {
  if (isArray(pattern)) {
    return pattern.some((p: string | RegExp) => matches(p, name))
  } else if (isString(pattern)) {
    return pattern.split(',').indexOf(name) > -1
  } else if (pattern.test) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function resetShapeFlag(vnode: VNode) {
  let shapeFlag = vnode.shapeFlag
  if (shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE) {
    shapeFlag -= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
  }
  if (shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
    shapeFlag -= ShapeFlags.COMPONENT_KEPT_ALIVE
  }
  vnode.shapeFlag = shapeFlag
}

function getInnerChild(vnode: VNode) {
  return vnode.shapeFlag & ShapeFlags.SUSPENSE ? vnode.ssContent! : vnode
}
