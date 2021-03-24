import { CreateAppFunction } from './apiCreateApp'
import {
  ComponentInternalInstance,
  setupComponent,
  createComponentInstance
} from './component'
import { updateProps } from './componentProps'
import {
  queueEffectWithSuspense,
  SuspenseBoundary
} from './components/Suspense'
import { createHydrationFunctions, RootHydrateFunction } from './hydration'
import {
  queuePostFlushCb,
  flushPostFlushCbs,
  queueJob,
  flushPreFlushCbs,
  invalidateJob
} from './scheduler'
import {
  cloneIfMounted,
  isSameVNodeType,
  normalizeVNode,
  VNode,
  VNodeArrayChildren,
  VNodeHook,
  Text,
  // Static,
  Fragment
} from './vnode'
import {
  renderComponentRoot,
  shouldUpdateComponent,
  updateHOCHostEl
} from './componentRenderUtils'
import { initFeatureFlags } from './featureFlags'
import { createAppAPI } from './apiCreateApp'
import {
  invokeArrayFns,
  isReservedProp,
  PatchFlags,
  ShapeFlags,
  EMPTY_ARR
} from '@vue/shared'
import { effect, ReactiveEffectOptions } from '@vue/reactivity'
import { callWithAsyncErrorHandling, ErrorCodes } from './errorHandling'

export interface Renderer<HostElement = RendererElement> {
  render: RootRenderFunction<HostElement>
  createApp: CreateAppFunction<HostElement>
}

export interface HydrationRenderer extends Renderer<Element> {
  hydrate: RootHydrateFunction
}

export type RootRenderFunction<HostElement = RendererElement> = (
  vnode: VNode | null,
  container: HostElement
) => void

export interface RendererOptions<
  HostNode = RendererNode,
  HostElement = RendererElement
> {
  patchProp(
    el: HostElement,
    key: string,
    prevValue: any,
    nextValue: any,
    isSVG?: boolean,
    prevChildren?: VNode<HostNode, HostElement>[],
    parentComponent?: ComponentInternalInstance | null,
    parentSuspense?: SuspenseBoundary | null,
    unmountChildren?: UnmountChildrenFn
  ): void
  forcePatchProp?(el: HostElement, key: string): boolean
  insert(el: HostNode, parent: HostElement, anchor?: HostNode | null): void
  remove(el: HostNode): void
  createElement(
    type: string,
    isSVG?: boolean,
    isCustomizedBuiltIn?: string
  ): HostElement
  createText(text: string): HostNode
  createComment(text: string): HostNode
  setText(node: HostNode, text: string): void
  setElementText(node: HostElement, text: string): void
  parentNode(node: HostNode): HostElement | null
  nextSibling(node: HostNode): HostNode | null
  querySelector?(selector: string): HostElement | null
  setScopeId?(el: HostElement, id: string): void
  cloneNode?(node: HostNode): HostNode
  insertStaticContent?(
    content: string,
    parent: HostElement,
    anchor: HostNode | null,
    isSVG: boolean
  ): HostElement[]
}

// Renderer Node can technically be any object in the context of core renderer
// logic - they are never directly operated on and always passed to the node op
// functions provided via options, so the internal constraint is really just
// a generic object.
export interface RendererNode {
  [key: string]: any
}

export interface RendererElement extends RendererNode {}

// An object exposing the internals of a renderer, passed to tree-shakeable
// features so that they can be decoupled from this file. Keys are shortened
// to optimize bundle size.
export interface RendererInternals<
  HostNode = RendererNode,
  HostElement = RendererElement
> {
  p: PatchFn
  um: UnmountFn
  r: RemoveFn
  m: MoveFn
  mt: MountComponentFn
  mc: MountChildrenFn
  pc: PatchChildrenFn
  pbc: PatchBlockChildrenFn
  n: NextFn
  o: RendererOptions<HostNode, HostElement>
}

// These functions are created inside a closure and therefore their types cannot
// be directly exported. In order to avoid maintaining function signatures in
// two places, we declare them once here and use them inside the closure.
type PatchFn = (
  n1: VNode | null, // null means this is a mount
  n2: VNode,
  container: RendererElement,
  anchor?: RendererNode | null,
  parentComponent?: ComponentInternalInstance | null,
  parentSuspense?: SuspenseBoundary | null,
  isSVG?: boolean,
  optimized?: boolean
) => void

type MountChildrenFn = (
  children: VNodeArrayChildren,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean,
  start?: number
) => void

type PatchChildrenFn = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized?: boolean
) => void

type PatchBlockChildrenFn = (
  oldChildren: VNode[],
  newChildren: VNode[],
  fallbackContainer: RendererElement,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean
) => void

type MoveFn = (
  vnode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  type: MoveType,
  parentSuspense?: SuspenseBoundary | null
) => void

type NextFn = (vnode: VNode) => RendererNode | null

type UnmountFn = (
  vnode: VNode,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  doRemove?: boolean,
  optimized?: boolean
) => void

type RemoveFn = (vnode: VNode) => void

type UnmountChildrenFn = (
  children: VNode[],
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  doRemove?: boolean,
  optimized?: boolean,
  start?: number
) => void

export type MountComponentFn = (
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean
) => void

type ProcessTextOrCommentFn = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null
) => void

export type SetupRenderEffectFn = (
  instance: ComponentInternalInstance,
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean
) => void

export const enum MoveType {
  ENTER,
  LEAVE,
  REORDER
}

const prodEffectOptions = {
  scheduler: queueJob,
  // #1801, #2043 component render effects should allow recursive updates
  allowRecurse: true
}

function createDevEffectOptions(
  instance: ComponentInternalInstance
): ReactiveEffectOptions {
  return {
    scheduler: queueJob,
    allowRecurse: true,
    onTrack: instance.rtc ? e => invokeArrayFns(instance.rtc!, e) : void 0,
    onTrigger: instance.rtg ? e => invokeArrayFns(instance.rtg!, e) : void 0
  }
}

export const queuePostRenderEffect = __FEATURE_SUSPENSE__
  ? queueEffectWithSuspense
  : queuePostFlushCb

/**
 * The createRenderer function accepts two generic arguments:
 * HostNode and HostElement, corresponding to Node and Element types in the
 * host environment. For example, for runtime-dom, HostNode would be the DOM
 * `Node` interface and HostElement would be the DOM `Element` interface.
 *
 * Custom renderers can pass in the platform specific types like this:
 *
 * ``` js
 * const { render, createApp } = createRenderer<Node, Element>({
 *   patchProp,
 *   ...nodeOps
 * })
 * ```
 */
export function createRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement
>(options: RendererOptions<HostNode, HostElement>) {
  return baseCreateRenderer<HostNode, HostElement>(options)
}

// Separate API for creating hydration-enabled renderer.
// Hydration logic is only used when calling this function, making it
// tree-shakable.
// export function createHydrationRenderer(
//   options: RendererOptions<Node, Element>
// ) {
//   return baseCreateRenderer(options, createHydrationFunctions)
// }

// overload 1: no hydration
function baseCreateRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement
>(options: RendererOptions<HostNode, HostElement>): Renderer<HostElement>

// overload 2: with hydration
// function baseCreateRenderer(
//   options: RendererOptions<Node, Element>,
//   createHydrationFns: typeof createHydrationFunctions
// ): HydrationRenderer

// implementation
function baseCreateRenderer(
  options: RendererOptions,
  createHydrationFns?: typeof createHydrationFunctions
) {
  if (__ESM_BUNDLER__ && !__TEST__) {
    initFeatureFlags()
  }

  // 1. 解构 options
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    cloneNode: hostCloneNode,
    createElement: hostCreateElement,
    createText: hostCreateText,
    setElementText: hostSetElementText,
    nextSibling: hostNextSibling,
    parentNode: hostParentNode
  } = options
  // 2. patch 函数
  const patch: PatchFn = (
    n1,
    n2,
    container,
    anchor = null,
    parentComponent = null,
    parentSuspense = null,
    isSVG = false,
    optimized = false
  ) => {
    // 不同类型节点，直接卸载老的🌲
    if (n1 && !isSameVNodeType(n1, n2)) {
      // 去下一个兄弟节点
      anchor = getNextHostNode(n1)
      unmount(n1, parentComponent, parentSuspense, true /* doRemove */)
      n1 = null
    }

    // TODO patch bail, 进行全比较(full diff)

    // 新节点处理
    const { type, ref, shapeFlag } = n2
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor)
        break
      default:
        // ELEMENT/COMPONENT/TELEPORT/SUSPENSE
        // 默认只支持这四种组件
        if (shapeFlag & ShapeFlags.ELEMENT) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        }
        break
    }

    if (ref != null && parentComponent) {
      // TODO set ref
    }
  }
  // 3. processText 处理文本
  const processText: ProcessTextOrCommentFn = (n1, n2, container, anchor) => {
    if (n1 == null /* old */) {
      // 新节点，插入处理
      hostInsert(
        (n2.el = hostCreateText(n2.children as string)),
        container,
        anchor
      )
    } else {
      // has old vnode, need to diff
    }
  }
  // 4. TODO processCommentNode 处理注释节点
  // 5. TODO mountStaticNode 加载静态节点
  // 6. TODO patchStaticNode, Dev/HMR only
  // 7. TODO moveStaticNode，移动静态节点
  // 8. TODO removeStaticNode, 删除静态节点
  // 9. processElement, 处理元素
  const processElement = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    isSVG = isSVG || (n2.type as string) === 'svg'
    if (n1 == null) {
      // no old
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    } else {
      patchElement(n1, n2, parentComponent, parentSuspense, isSVG, optimized)
    }
  }
  // 10. mountElement, 加载元素
  const mountElement = (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    // TODO
    let el: RendererElement
    let vnodeHook: VNodeHook | undefined | null
    const { type, shapeFlag, patchFlag, props } = vnode

    if (
      !__DEV__ &&
      vnode.el &&
      hostCloneNode !== undefined &&
      patchFlag === PatchFlags.HOISTED
    ) {
      // TODO
      el = null as any
    } else {
      el = vnode.el = hostCreateElement(
        vnode.type as string,
        isSVG,
        props && props.is
      )

      // 在处理 props 之前先 mount children ，因为
      // 有些 props 可能会依赖于 child 是否已经渲染出来
      // 比如： `<select value>`
      if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // 文本节点处理(纯文本，插值)
        hostSetElementText(el, vnode.children as string)
      } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        mountChildren(
          vnode.children as VNodeArrayChildren,
          el,
          null,
          parentComponent,
          parentSuspense,
          isSVG && type !== 'foreignObject',
          optimized || !!vnode.dynamicChildren
        )
      }

      if (props) {
        for (const key in props) {
          // vue 保留属性 ref/key/onVnodeXxx 生命周期
          if (!isReservedProp(key)) {
            hostPatchProp(
              el,
              key,
              null,
              props[key],
              isSVG,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            )
          }
        }

        if ((vnodeHook = props.onVnodeBeforeMount)) {
          // 执行 before mount hook
          invokeVNodeHook(vnodeHook, parentComponent, vnode)
        }
      }
    }

    // ...

    // hostInsert
    hostInsert(el, container, anchor)

    // ...
  }
  // 11. TODO setScopeId, 设置 scope id
  // 12. TODO mountChildren, 加载孩子节点
  const mountChildren: MountChildrenFn = (
    children,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized,
    start = 0
  ) => {
    for (let i = start; i < children.length; i++) {
      const child = (children[i] = optimized
        ? // 这里是检测 child.el 是不是存在，如果存在则是可服用的 vnode
          // 即需要提升的静态节点，则需要进行 cloneVNode 之后返回
          // 新的 vnode 对象
          cloneIfMounted(children[i] as VNode)
        : // 根据 child 的类型进行拆分处理
          // 1. boolean, 创建一个空的 Comment
          // 2. array, 使用 Fragment 将 child 包起来
          // 3. object, 如果是对象，child.el 存在与否进行 clone
          // 4. 其他情况，字符串或数字，当做 Text 类型处理
          normalizeVNode(children[i]))
      // 然后进入 patch 递归处理 children
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    }
  }
  // 13. patchElement
  const patchElement = (
    n1: VNode,
    n2: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    // 旧的 el 替换掉新的 el ?
    const el = (n2.el = n1.el!)
    let { patchFlag, dynamicChildren } = n2
    // #1426 take the old vnode's patch flag into account since user may clone a
    // compiler-generated vnode, which de-opts to FULL_PROPS
    patchFlag |= n1.patchFlag & PatchFlags.FULL_PROPS
    // const oldProps = n1.props || EMPTY_OBJ
    // const newProps = n2.props || EMPTY_OBJ

    // TODO before update hooks

    // TODO dirs, 指令处理

    // TODO HRM updating

    // patch props 处理
    if (patchFlag > 0) {
    } else if (!optimized && dynamicChildren == null) {
      // 未优化的，需要 full diff
    }

    const areChildrenSVG = isSVG && n2.type !== 'foreignObject'

    // patch children
    if (dynamicChildren) {
    } else if (!optimized) {
      // full diff
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        areChildrenSVG
      )
    }

    // TODO vnode hook or dirs 处理
  }
  // 14. TODO patchBlockChildren
  // 15. TODO patchProps
  // 16. TODO processFragment

  // 17. processComponent
  const processComponent = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    if (n1 == null) {
      // mount
      if (false /* keep alive */) {
        // TODO
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      }
    } else {
      updateComponent(n1, n2, optimized)
    }
  }
  // 18. mountComponent
  const mountComponent: MountComponentFn = (
    initialVNode,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized
  ) => {
    const instance: ComponentInternalInstance = (initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    ))

    setupComponent(instance)
    console.log('mount component')

    setupRenderEffect(
      instance,
      initialVNode,
      container,
      anchor,
      parentSuspense,
      isSVG,
      optimized
    )
  }
  // 19. updateComponent
  const updateComponent = (n1: VNode, n2: VNode, optimized: boolean) => {
    console.log('update component')
    const instance = (n2.component = n1.component)!
    if (shouldUpdateComponent(n1, n2, optimized)) {
      console.log('should update component....')
      if (
        __FEATURE_SUSPENSE__ &&
        instance.asyncDep && // async setup
        instance.asyncResolved
      ) {
        // async & still pending - just update props and slots
        // since the component's reactive effect for render isn't set-up yet
        updateComponentPreRender(instance, n2, optimized)
        return
      } else {
        console.log('normal update')
        // 正常更新
        instance.next = n2
        // 考虑到 child 组件可能正在队列中排队，移除它避免
        // 在同一个 flush tick 重复更新同一个子组件
        // 当下一次更新来到时，之前的一次更新取消？
        invalidateJob(instance.update)
        // instance.update 是在 setupRenderEffect 中
        // 定义的一个 reactive effect runner
        // 主动触发更新
        instance.update()
      }
      return
    } else {
      console.log('should not update component....')
      // 没有更新，仅用 old child 的属性覆盖 new child
      n2.component = n1.component
      n2.el = n1.el
      instance.vnode = n2
    }
  }
  // 20. setupRenderEffect
  const setupRenderEffect: SetupRenderEffectFn = (
    instance,
    initialVNode,
    container,
    anchor,
    parentSuspense,
    isSVG,
    optimized
  ) => {
    instance.update = effect(
      function componentEffect() {
        console.log('update effect')
        // 监听更新
        if (!instance.isMounted) {
          // 还没加载完成，可能是第一次 mount 操作
          let vnodeHook: VNodeHook | null | undefined
          const { el, props } = initialVNode
          const { bm, m, parent } = instance

          // 1. beforeMount hook
          if (bm) {
            invokeArrayFns(bm)
          }

          // 2. onVnodeBeforeMount
          if ((vnodeHook = props && props.onVnodeBeforeMount)) {
            invokeVNodeHook(vnodeHook, parent, initialVNode)
          }

          // 3. render
          // TODO start, end measure
          const subTree = (instance.subTree = renderComponentRoot(instance))

          if (el && hydrateNode) {
            // TODO hydrateNode
          } else {
            console.log('patch component')
            patch(
              null,
              subTree,
              container,
              anchor,
              instance,
              parentSuspense,
              isSVG
            )
            initialVNode.el = subTree.el
          }

          // mounted hook
          if (m) {
            queuePostRenderEffect(m, parentSuspense)
          }

          // onVnodemounted
          if ((vnodeHook = props && props.onVnodeMounted)) {
            const scopedInitialVNode = initialVNode
            queuePostRenderEffect(() => {
              invokeVNodeHook(vnodeHook!, parent, scopedInitialVNode)
            }, parentSuspense)
          }

          // activated hook for keep-alive roots.
          // #1742 activated hook must be accessed after first render
          // since the hook may be injected by a child keep-alive
          const { a } = instance
          if (
            a &&
            initialVNode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
          ) {
            queuePostRenderEffect(a, parentSuspense)
          }
          instance.isMounted = true

          // #2458: deference mount-only object parameters to prevent memleaks
          // 释放资源
          initialVNode = container = anchor = null as any
        } else {
          // updateComponent
          // 当组件自身的状态或父组件调用 processComponent 时触发
          console.log('component update')
          let { next, bu, u, parent, vnode } = instance
          let originNext = next
          let vnodeHook: VNodeHook | null | undefined

          if (next) {
            next.el = vnode.el
            updateComponentPreRender(instance, next, optimized)
          } else {
            next = vnode
          }

          // beforeUpdate hook
          if (bu) {
            invokeArrayFns(bu)
          }
          // onVnodeBeforeUpdate
          if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
            invokeVNodeHook(vnodeHook, parent, next, vnode)
          }

          //render
          const nextTree = renderComponentRoot(instance)
          const prevTree = instance.subTree
          instance.subTree = nextTree

          patch(
            prevTree,
            nextTree,
            // 如果在 teleport 中，parent 可能会发生改变
            hostParentNode(prevTree.el!)!,
            // anchor may have changed if it's in a fragment
            getNextHostNode(prevTree),
            instance,
            parentSuspense,
            isSVG
          )

          next.el = nextTree.el
          if (originNext === null) {
            // self-triggered update. In case of HOC, update parent component
            // vnode el. HOC is indicated by parent instance's subTree pointing
            // to child component's vnode
            updateHOCHostEl(instance, nextTree.el)
          }

          // updated hook
          if (u) {
            queuePostRenderEffect(u, parentSuspense)
          }
          // onVnodeUpdated
          if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
            queuePostRenderEffect(() => {
              invokeVNodeHook(vnodeHook!, parent, next!, vnode)
            })
          }
        }
      },
      __DEV__
        ? // 提供 onTrack/onTrigger 选项执行 rtc&rtg 两个周期函数
          createDevEffectOptions(instance)
        : prodEffectOptions
    )
  }
  // 21. updateComponentPreRender
  const updateComponentPreRender = (
    instance: ComponentInternalInstance,
    nextVNode: VNode,
    optimized: boolean
  ) => {
    console.log('update comp pre render')
    nextVNode.component = instance
    const prevProps = instance.vnode.props
    instance.vnode = nextVNode
    instance.next = null
    // update props
    updateProps(instance, nextVNode.props, prevProps, optimized)
    // TODO update slots

    // props update may have triggered pre-flush watchers.
    // flush them before the render update.
    flushPreFlushCbs(undefined, instance.update)
  }
  // 22. patchChildren
  const patchChildren: PatchChildrenFn = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized = false
  ) => {
    const c1 = n1 && n1.children
    const prevShapeFlag = n1 ? n1.shapeFlag : 0
    const c2 = n2.children

    const { patchFlag, shapeFlag } = n2
    // fast path
    if (patchFlag > 0) {
      if (patchFlag & PatchFlags.KEYED_FRAGMENT) {
        // this could be either fully-keyed or mixed (some keyed some not)
        // presence of patchFlag means children are guaranteed to be arrays
        patchKeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        return
      } else if (patchFlag & PatchFlags.UNKEYED_FRAGMENT) {
        patchUnkeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        return
      }
    }

    // children 有三种可能： text, array, 或没有 children
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // text children fast path
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(c1 as VNode[], parentComponent, parentSuspense)
      }

      if (c2 !== c1) {
        hostSetElementText(container, c2 as string)
      }
    } else {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          patchKeyedChildren(
            c1 as VNode[],
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else {
          // new null, old array 直接卸载 old
          unmountChildren(
            c1 as VNode[],
            parentComponent,
            parentSuspense,
            true /* doRemove */
          )
        }
      } else {
        // prev children was text or null
        // new children is array or null
        // 老的 children 是 text，新的又是数组情况
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          // 先清空？
          hostSetElementText(container, '')
        }
        // 然后直接重新加载新的 array children -> c2
        // old children 是 array
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        }
      }
    }
  }

  // 23. patchUnkeyedChildren
  const patchUnkeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    c1 = c1 || EMPTY_ARR
    c2 = c2 || EMPTY_ARR
    const oldLength = c1.length
    const newLength = c2.length
    const commonLength = Math.min(oldLength, newLength)
    let i
    for (i = 0; i < commonLength; i++) {
      const nextChild = (c2[i] = optimized
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    }

    if (oldLength > newLength) {
      // remove old
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      )
    } else {
      // mount new
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized,
        commonLength
      )
    }
  }
  // 24. 可能所有都是 keyed 也可能部分
  const patchKeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    parentAnchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    let i = 0
    const l2 = c2.length
    let e1 = c1.length - 1 // 上一个结束索引
    let e2 = l2 - 1 // 下一个结束索引

    // 1. sync from start
    // (a b) c
    // (a b) d e
    // 这里结束之后 i 就会定位到第一个不同类型的位置，即 2
    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = (c2[i] = optimized // 静态节点
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))

      // type & key 相同
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else {
        break
      }
      i++
    }

    // 2. sync from end
    // a (b c)
    // d e (b c)
    // 这里结束之后，后面相同的节点就被处理掉了，此时 e1 = 0, e2 = 1
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1]
      const n2 = (c2[e2] = optimized
        ? cloneIfMounted(c2[e2] as VNode)
        : normalizeVNode(c2[e2]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else {
        break
      }
      e1--
      e2--
    }

    // 3. common sequence + mount
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1
        const anchor = nextPos < l2 ? (c2[nextPos] as VNode).el : parentAnchor
        while (i <= e2) {
          patch(
            null,
            (c2[i] = optimized
              ? cloneIfMounted(c2[i] as VNode)
              : normalizeVNode(c2[i])),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG
          )
          i++
        }
      }
    }

    // 4. common sequence + unmount
    // (a b) c
    // (a b)
    // i = 2, e1 = 2, e2 = 1
    // a (b c)
    // (b c)
    // i = 0, e1 = 0, e2 = -1
    else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true /* doRemove */)
        i++
      }
    }

    // 5. unknown sequence, 未知序列
    // [i ... e1 + 1]: a b [c d e] f g
    // [i ... e2 + 1]: a b [e d c h] f g
    // i = 2, e1 = 4, e2 = 5
    else {
      const s1 = i // prev starting index
      const s2 = i // next starting index

      // 5.1 build key:index map for newChildren
      // 给新的 children 创建新的 key
      const keyToNewIndexMap: Map<string | number, number> = new Map()
      // 从 new nodes 开始，可处理删除和新增操作
      // 这里目的是保存 new nodes 中 child 的 key 和索引的对应关系
      for (i = s2; i <= e2; i++) {
        const nextChild = (c2[i] = optimized
          ? cloneIfMounted(c2[i] as VNode)
          : normalizeVNode(c2[i]))

        if (nextChild.key != null) {
          // 新的 child 有自己的 Key
          // TODO warn 重复 key
          keyToNewIndexMap.set(nextChild.key, i)
        }
      }

      // 5.2 遍历 old children，执行 patch 或 remove 操作
      let j
      let patched = 0
      // 需要被 patch 的 old child 数
      // 如：
      // old: (a b) c
      // new: (a b) d e
      // 那么需要处理的数为 2(d,e 位置)
      const toBePatched = e2 - s2 + 1
      let moved = false
      // 用来跟踪有多少节点被移除了
      let maxNewIndexSoFar = 0
      // works as Map<newIndex, oldIndex>
      // Note that oldIndex is offset by +1
      // and oldIndex = 0 is a special value indicating the new node has
      // no corresponding old node.
      // used for determining longest stable subsequence
      const newIndexToOldIndexMap = new Array(toBePatched)
      for (i = 0; i < toBePatched; i++) {
        // 初始化
        newIndexToOldIndexMap[i] = 0
      }

      // 遍历 old children 剩余的不同节点
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i]
        if (patched >= toBePatched) {
          // 移除 old child
          unmount(prevChild, parentComponent, parentSuspense, true)
          continue
        }
        let newIndex
        // old child 也有自己的 key
        if (prevChild.key != null) {
          // 用 old child 的 key 从 new children key map 里面
          // 找到相同 key 的 new child，所以替换不是按照顺序来替换的
          // (a b) c -> (a b) d e 很有可能 c 会被 e 给替换了
          newIndex = keyToNewIndexMap.get(prevChild.key)
        } else {
          // 没有 key 的 old child，尝试将一个同类型的无 key 的 new child
          // 放进来，遍历 new children
          for (j = s2; j <= e2; j++) {
            // 从 d 位置开始搜索，同类型无 key 的 new child
            if (
              newIndexToOldIndexMap[j - s2] === 0 &&
              isSameVNodeType(prevChild, c2[j] as VNode)
            ) {
              newIndex = j
              break
            }
          }
        }

        // 这个 newIndex 是可以用来替换当前的 old child 的那个节点
        if (newIndex === undefined) {
          // 没有找到可替换的节点，直接删除 old child
          unmount(prevChild, parentComponent, parentSuspense, true)
        } else {
          // 找到可用来替换的，将这个标识位填充为当前 old child index + 1
          // 此处的 i 即 for old children 时的索引，说明这个 new child
          // 已经用来替换过了，下次循环不能再用了
          newIndexToOldIndexMap[newIndex - s2] = i + 1
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex
          } else {
            moved = true
          }
          patch(
            prevChild,
            c2[newIndex] as VNode,
            container,
            null,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
          patched++
        }
      }

      // 5.3 move and mount
      // generate longest stable subsequence only when nodes have moved
      // 最长有序递增序列，从一串数字中找到最长的有序数列，结果序列中的数字顺序
      // 必须符合原序列中的先后顺序
      // 首先 newIndexToOldIndexMap 这个是用来保存 new children 中曾经
      // 用来替换 old child 的那个 new child 的索引，上面在替换的时候
      // 会赋值给 i + 1 给当前 newIndex - s2 索引位置值
      // 如： (a b) c 和 (a b) d e 假如 e 符合替换 c 的条件
      // 那么 newIndexToOldIndexMap[3 - 2] = 3 + 1
      const increasingNewIndexSequence = moved
        ? getSequence(newIndexToOldIndexMap)
        : EMPTY_ARR
      j = increasingNewIndexSequence.length - 1

      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i
        const nextChild = c2[nextIndex] as VNode
        const anchor =
          nextIndex + 1 < l2 ? (c2[nextIndex + 1] as VNode).el : parentAnchor
        if (newIndexToOldIndexMap[i] === 0) {
          // mount new，这个 old children 位置没有 new child 替换
          // 所以执行 mount new child
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG
          )
        } else if (moved) {
          // move if:
          // There is no stable subsequence (e.g. a reverse)
          // OR current node is not among the stable sequence
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, MoveType.REORDER)
          } else {
            j--
          }
        }
      }
    }
  }
  // 25. move， 交换操作
  const move: MoveFn = (
    vnode,
    container,
    anchor,
    moveType,
    parentSuspense = null
  ) => {
    const { el } = vnode
    // TODO COMPONENT
    // TODO SUSPENSE
    // TODO TELEPORT
    // TODO Fragment
    // TODO Static
    if (false /*needTransition*/) {
      // TODO
    } else {
      // 目前只实现普通元素的逻辑
      hostInsert(el!, container, anchor)
    }
  }
  // 26. unmount
  const unmount: UnmountFn = (
    vnode,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false
  ) => {
    const {
      type,
      props,
      ref,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs
    } = vnode

    // TODO unset ref

    // TODO keep-alive

    // TODO 执行 onVnodeBeforeUnmount hook

    if (shapeFlag & ShapeFlags.COMPONENT) {
      // TODO unmount component
    } else {
      // TODO SUSPENSE

      // TODO should invoke dirs

      if (false /* dyanmic children */) {
        // TODO
      } else if (
        (type === Fragment &&
          (patchFlag & PatchFlags.KEYED_FRAGMENT ||
            patchFlag & PatchFlags.UNKEYED_FRAGMENT)) ||
        (!optimized && shapeFlag & ShapeFlags.ARRAY_CHILDREN)
      ) {
        unmountChildren(children as VNode[], parentComponent, parentSuspense)
      }

      // TODO TELEPORT

      if (doRemove) {
        remove(vnode)
      }
    }

    // TODO 执行 onVnodeUnmounted hook
  }
  // 27. remove
  const remove: RemoveFn = vnode => {
    const { type, el, anchor, transition } = vnode
    // TODO Fragment

    // TODO Static

    const performRemove = () => {
      // 将 el 从它的 parenNode.children 中删除
      hostRemove(el!)
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave()
      }
    }

    if (false /* ELEMENT */) {
      // TODO
    } else {
      performRemove()
    }
  }
  // 28. TODO removeFragment
  // 29. TODO unmountComponent
  // 30. TODO unmountChildren
  const unmountChildren: UnmountChildrenFn = (
    children,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false,
    start = 0
  ) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized)
    }
  }
  // 31. getNextHostNode
  const getNextHostNode: NextFn = vnode => {
    // TODO COMPONENT
    // TODO SUSPENSE

    return hostNextSibling((vnode.anchor || vnode.el)!)
  }
  // 32. render
  const render: RootRenderFunction = (vnode, container) => {
    // render(h('div'), root)
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true)
      }
    } else {
      patch(container._vnode || null, vnode, container)
    }
    // 执行所有 post 异步任务
    flushPostFlushCbs()
    container._vnode = vnode
  }
  // 33. internals object, 函数别名
  const internals: RendererInternals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: [] as any /*patchBlockChildren*/,
    n: getNextHostNode,
    o: options
  }

  // 34. createHydrationFns
  let hydrate: ReturnType<typeof createHydrationFunctions>[0] | undefined
  let hydrateNode: ReturnType<typeof createHydrationFunctions>[1] | undefined

  if (createHydrationFns) {
    ;[hydrate, hydrateNode] = createHydrationFns(internals as RendererInternals<
      Node,
      Element
    >)
  }
  // 35. return { render, hydrate, createApp }
  return {
    render,
    hydrate,
    createApp: createAppAPI(render, hydrate)
  }
}

export function invokeVNodeHook(
  hook: VNodeHook,
  instance: ComponentInternalInstance | null,
  vnode: VNode,
  prevVNode: VNode | null = null
) {
  callWithAsyncErrorHandling(hook, instance, ErrorCodes.VNODE_HOOK, [
    vnode,
    prevVNode
  ])
}

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function getSequence(arr: number[]): number[] {
  const p = arr.slice()
  const result = [0]
  let i, j, u, v, c
  const len = arr.length
  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1
      while (u < v) {
        c = ((u + v) / 2) | 0
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}
