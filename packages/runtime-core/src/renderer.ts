import { CreateAppFunction } from './apiCreateApp'
import { ComponentInternalInstance } from './component'
import {
  queueEffectWithSuspense,
  SuspenseBoundary
} from './components/Suspense'
import { createHydrationFunctions, RootHydrateFunction } from './hydration'
import { queuePostFlushCb, flushPostFlushCbs } from './scheduler'
import {
  cloneIfMounted,
  isSameVNodeType,
  normalizeVNode,
  VNode,
  VNodeArrayChildren,
  VNodeHook,
  Text
  // Static,
  // Fragment
} from './vnode'
import { initFeatureFlags } from './featureFlags'
import { createAppAPI } from './apiCreateApp'
import { isReservedProp, PatchFlags, ShapeFlags } from '@vue/shared'
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
    patchProp: hostPatchProp,
    cloneNode: hostCloneNode,
    createElement: hostCreateElement,
    createText: hostCreateText,
    setElementText: hostSetElementText
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
    console.log('patching...')
    // 不同类型节点，直接卸载老的🌲
    if (n1 && !isSameVNodeType(n1, n2)) {
      // TODO
    }

    // TODO patch bail, 进行全比较(full diff)

    // 新节点处理
    const { type, ref, shapeFlag } = n2
    console.log({ type, shapeFlag })
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
        }
        break
    }

    if (ref != null && parentComponent) {
      // TODO set ref
    }
  }
  // 3. processText 处理文本
  const processText: ProcessTextOrCommentFn = (n1, n2, container, anchor) => {
    console.log('process text...')
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
    console.log('process element...')
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
    console.log('mount element...')
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
      console.log(`mountElement if...`)
    } else {
      console.log(`mountElment else...`)
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
    // const el = (n2.el = n1.el!)
    let { patchFlag, dynamicChildren } = n2
    // #1426 take the old vnode's patch flag into account since user may clone a
    // compiler-generated vnode, which de-opts to FULL_PROPS
    patchFlag |= n1.patchFlag & PatchFlags.FULL_PROPS
    // const oldProps = n1.props || EMPTY_OBJ
    // const newProps = n2.props || EMPTY_OBJ

    // TODO before update hooks

    // TODO dirs, 指令处理

    // TODO HRM updating

    if (patchFlag > 0) {
    } else if (!optimized && dynamicChildren == null) {
    }

    // const areaChildrenSVG = isSVG && n2.type !== 'foreignObject'

    if (dynamicChildren) {
    } else if (!optimized) {
    }

    // TODO vnode hook or dirs 处理
  }
  // 14. TODO patchBlockChildren
  // 15. TODO patchProps
  // 16. TODO processFragment
  // 17. TODO processComponent
  // 18. TODO mountComponent
  // 19. TODO updateComponent
  // 20. TODO setupRenderEffect
  // 21. TODO updateComponentPreRender
  // 22. TODO patchChildren
  // 23. TODO patchUnkeyedChildren
  // 24. TODO patchKeyedChildren
  // 25. TODO move
  // 26. unmount
  const unmount: UnmountFn = (
    vndoe,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false
  ) => {
    // TODO
  }
  // 27. TODO remove
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
    //TODO
  }
  // 31. TODO getNextHostNode
  // 32. render
  const render: RootRenderFunction = (vnode, container) => {
    console.log('render.......')
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
  // 33. TODO internals object, 函数别名
  // 34. TODO createHydrationFns
  let hydrate
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
