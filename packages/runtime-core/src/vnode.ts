import {
  ClassComponent,
  Component,
  ComponentInternalInstance,
  Data,
  isClassComponent
} from './component'
import { TeleportImpl, isTeleport } from './components/Teleport'
import {
  SuspenseBoundary,
  SuspenseImpl,
  isSuspense
} from './components/Suspense'
import { isProxy, isRef, ReactiveFlags, Ref, toRaw } from '@vue/reactivity'
import { currentScopeId } from './helpers/scopeId'
import { RawSlots } from './componentSlots'
import { RendererNode, RendererElement } from './renderer'
import { DirectiveBinding } from './directives'
import { TransitionHooks } from './components/BaseTransition'
import { AppContext } from './apiCreateApp'
import { currentRenderingInstance } from './componentRenderUtils'
import { NULL_DYNAMIC_COMPONENT } from './helpers/resolveAssets'
import { warn } from './warning'
import {
  extend,
  isArray,
  isFunction,
  isObject,
  isOn,
  isString,
  normalizeClass,
  normalizeStyle,
  PatchFlags,
  ShapeFlags,
  SlotFlags
} from '@vue/shared'
import { setCompiledSlotRendering } from './helpers/renderSlot'

export const Fragment = (Symbol(__DEV__ ? 'Fragment' : undefined) as any) as {
  __isFragment: true
  new (): {
    $props: VNodeProps
  }
}
export const Text = Symbol(__DEV__ ? 'Text' : undefined)
export const Comment = Symbol(__DEV__ ? 'Comment' : undefined)
export const Static = Symbol(__DEV__ ? 'Static' : undefined)

export type VNodeTypes =
  | string
  | VNode
  | Component
  | typeof Text
  | typeof Static
  | typeof Comment
  | typeof Fragment
  | typeof TeleportImpl
  | typeof SuspenseImpl

export type VNodeRef =
  | string
  | Ref
  | ((ref: object | null, refs: Record<string, any>) => void)

export type VNodeNormalizedRefAtom = {
  i: ComponentInternalInstance
  r: VNodeRef
}

export type VNodeNormalizedRef =
  | VNodeNormalizedRefAtom
  | (VNodeNormalizedRefAtom)[]

type VNodeMountHook = (vnode: VNode) => void
type VNodeUpdateHook = (vnode: VNode, oldVNode: VNode) => void
export type VNodeHook =
  | VNodeMountHook
  | VNodeUpdateHook
  | VNodeMountHook[]
  | VNodeUpdateHook[]

// https://github.com/microsoft/TypeScript/issues/33099
export type VNodeProps = {
  key?: string | number
  ref?: VNodeRef

  // vnode hooks
  onVnodeBeforeMount?: VNodeMountHook | VNodeMountHook[]
  onVnodeMounted?: VNodeMountHook | VNodeMountHook[]
  onVnodeBeforeUpdate?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeUpdated?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeBeforeUnmount?: VNodeMountHook | VNodeMountHook[]
  onVnodeUnmounted?: VNodeMountHook | VNodeMountHook[]
}

type VNodeChildAtom =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | void

export type VNodeArrayChildren = Array<VNodeArrayChildren | VNodeChildAtom>

export type VNodeChild = VNodeChildAtom | VNodeArrayChildren

export type VNodeNormalizedChildren =
  | string
  | VNodeArrayChildren
  | RawSlots
  | null

export interface VNode<
  HostNode = RendererNode,
  HostElement = RendererElement,
  ExtraProps = { [key: string]: any }
> {
  /**
   * @internal
   */
  __v_isVNode: true
  /**
   * @internal
   */
  [ReactiveFlags.SKIP]: true
  type: VNodeTypes
  props: (VNodeProps & ExtraProps) | null
  key: string | number | null
  ref: VNodeNormalizedRef | null
  scopeId: string | null // SFC only
  children: VNodeNormalizedChildren
  component: ComponentInternalInstance | null
  dirs: DirectiveBinding[] | null
  transition: TransitionHooks<HostElement> | null

  // DOM
  el: HostNode | null
  anchor: HostNode | null // fragment anchor
  target: HostElement | null // teleport target
  targetAnchor: HostNode | null // teleport target anchor
  staticCount: number // number of elements contained in a static vnode

  // suspense
  suspense: SuspenseBoundary | null
  ssContent: VNode | null
  ssFallback: VNode | null

  // optimization only
  shapeFlag: number
  patchFlag: number
  dynamicProps: string[] | null
  dynamicChildren: VNode[] | null

  // application root node only
  appContext: AppContext | null
}

export function isVNode(value: any): value is VNode {
  return value ? value.__v_isVNode === true : false
}

let vnodeArgsTransformer:
  | ((
      args: Parameters<typeof _createVNode>,
      instance: ComponentInternalInstance | null
    ) => Parameters<typeof _createVNode>)
  | undefined

/**
 * Internal API for registering an arguments transform for createVNode
 * used for creating stubs in the test-utils
 * It is *internal* but needs to be exposed for test-utils to pick up proper
 * typings
 */
export function transformVNodeArgs(transformer?: typeof vnodeArgsTransformer) {
  vnodeArgsTransformer = transformer
}

const createVNodeWithArgsTransform = (
  ...args: Parameters<typeof _createVNode>
): VNode => {
  return _createVNode(
    ...(vnodeArgsTransformer
      ? vnodeArgsTransformer(args, currentRenderingInstance)
      : args)
  )
}

export const InternalObjectKey = `__vInternal`

const normalizeKey = ({ key }: VNodeProps): VNode['key'] =>
  key != null ? key : null

const normalizeRef = ({ ref }: VNodeProps): VNodeNormalizedRefAtom | null => {
  return (ref != null
    ? isString(ref) || isRef(ref) || isFunction(ref)
      ? { i: currentRenderingInstance, r: ref }
      : ref
    : null) as any
}

export const createVNode = (__DEV__
  ? createVNodeWithArgsTransform
  : _createVNode) as typeof _createVNode

function _createVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null,
  isBlockNode = false
): VNode {
  // 无效的 tag 类型
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (__DEV__ && !type) {
      warn(`Invalid vnode type when creating vnode: ${type}.`)
    }
    type = Comment
  }

  // 1. type is vnode
  if (isVNode(type)) {
    // createVNode receiving an existing vnode. This happens in cases like
    // <component :is="vnode"/>
    // #2078 make sure to merge refs during the clone instead of overwriting it
    const cloned = cloneVNode(type, props, true /* mergeRef: true */)
    if (children) {
      normalizeChildren(cloned, children)
    }
    return cloned
  }

  // 2. class component
  if (isClassComponent(type)) {
    type = type.__vccOpts
  }

  // 3. props 处理, class & style normalization
  if (props) {
    // for reactive or proxy objects, we need to clone it to enable mutation.
    if (isProxy(props) || InternalObjectKey in props) {
      props = extend({}, props)
    }
    let { class: klass, style } = props
    if (klass && !isString(klass)) {
      // 1. string -> klass
      // 'foo' -> 'foo'
      // 2. array -> '' + arr.join(' ')
      // ['foo', 'bar'] -> 'foo bar'
      // 3. object -> '' + value ? ' value' : ''
      // { foo: true, bar: false, baz: true } -> 'foo baz'
      props.class = normalizeClass(klass)
    }

    if (isObject(style)) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style)
      }
      // 1. array -> object
      // [{ color: 'red' }, 'font-size:10px;height:100px;'] ->
      // { color: 'red', 'font-size': '10px', height: '100px' }
      // 2. object -> object 原样返回
      props.style = normalizeStyle(style)
    }
  }

  // encode the vnode type information into a bitmap
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : __FEATURE_SUSPENSE__ && isSuspense(type)
      ? ShapeFlags.SUSPENSE
      : isTeleport(type)
        ? ShapeFlags.TELEPORT
        : isObject(type)
          ? ShapeFlags.STATEFUL_COMPONENT
          : isFunction(type)
            ? ShapeFlags.FUNCTIONAL_COMPONENT
            : 0

  // 4. warn STATEFUL_COMPONENT
  if (__DEV__ && shapeFlag & ShapeFlags.STATEFUL_COMPONENT && isProxy(type)) {
    type = toRaw(type)
    warn(
      `Vue received a Component which was made a reactive object. This can ` +
        `lead to unnecessary performance overhead, and should be avoided by ` +
        `marking the component with \`markRaw\` or using \`shallowRef\` ` +
        `instead of \`ref\`.`,
      `\nComponent that was made reactive: `,
      type
    )
  }

  // 构建 vnode 对象
  const vnode: VNode = {
    __v_isVNode: true,
    [ReactiveFlags.SKIP]: true /*不用做响应式处理*/,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    children: null,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null
  }

  // 5. 检查 key, 不能是 NaN
  if (__DEV__ && vnode.key !== vnode.key) {
    warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type)
  }

  // 6. normalize children
  normalizeChildren(vnode, children)

  // 7. TODO normalize suspense children

  // 8. TODO currentBlock

  return vnode
}

export function cloneVNode<T, U>(
  vnode: VNode<T, U>,
  extraProps?: Data & VNodeProps | null,
  mergeRef = false
): VNode<T, U> {
  // This is intentionally NOT using spread or extend to avoid the runtime
  // key enumeration cost.
  const { props, ref, patchFlag } = vnode
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props
  return {
    __v_isVNode: true,
    [ReactiveFlags.SKIP]: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref:
      extraProps && extraProps.ref
        ? // #2078 in the case of <component :is="vnode" ref="extra"/>
          // if the vnode itself already has a ref, cloneVNode will need to merge
          // the refs so the single vnode can be set on multiple refs
          mergeRef && ref
          ? isArray(ref)
            ? ref.concat(normalizeRef(extraProps)!)
            : [ref, normalizeRef(extraProps)!]
          : normalizeRef(extraProps)
        : ref,
    scopeId: vnode.scopeId,
    children: vnode.children,
    target: vnode.target,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: perserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag:
      extraProps && vnode.type !== Fragment
        ? patchFlag === -1 // hoisted node
          ? PatchFlags.FULL_PROPS
          : patchFlag | PatchFlags.FULL_PROPS
        : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition: vnode.transition,

    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    el: vnode.el,
    anchor: vnode.anchor
  }
}

/**
 * @private
 */
export function createTextVNode(text: string = ' ', flag: number = 0): VNode {
  return createVNode(Text, null, text, flag)
}

export function normalizeChildren(vnode: VNode, children: unknown) {
  let type = 0
  const { shapeFlag } = vnode
  if (children == null) {
    children = null
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN
  } else if (isObject(children)) {
    // & 操作，这里等于是检测是 ELEMENT 还是 TELEPORT
    // 因为 ShapeFlags 内的值是通过左移位得到的
    if (shapeFlag & ShapeFlags.ELEMENT || shapeFlag & ShapeFlags.TELEPORT) {
      // Normalize slot to plain children for plain element and Teleport
      const slot = (children as any).default
      if (slot) {
        // _c marker is added by withCtx() indicating this is a compiled slot
        slot._c && setCompiledSlotRendering(1)
        normalizeChildren(vnode, slot())
        slot._c && setCompiledSlotRendering(-1)
      }
      return
    } else {
      type = ShapeFlags.SLOTS_CHILDREN
      const slotFlag = (children as RawSlots)._
      if (!slotFlag && !(InternalObjectKey in children!)) {
        // if slots are not normalized, attach context instance
        // (compiled / normalized slots already have context)
        ;(children as RawSlots)._ctx = currentRenderingInstance
      } else if (slotFlag === SlotFlags.FORWARDED && currentRenderingInstance) {
        // a child component receives forwarded slots from the parent.
        // its slot type is determined by its parent's slot type.
        if (
          currentRenderingInstance.vnode.patchFlag & PatchFlags.DYNAMIC_SLOTS
        ) {
          ;(children as RawSlots)._ = SlotFlags.DYNAMIC
          vnode.patchFlag |= PatchFlags.DYNAMIC_SLOTS
        } else {
          ;(children as RawSlots)._ = SlotFlags.STABLE
        }
      }
    }
  } else if (isFunction(children)) {
    // 如果是函数当做 slot children ?
    children = { default: children, _ctx: currentRenderingInstance }
    type = ShapeFlags.SLOTS_CHILDREN
  } else {
    children = String(children)
    // force teleport children to array so it can be moved around
    if (shapeFlag & ShapeFlags.TELEPORT) {
      type = ShapeFlags.ARRAY_CHILDREN
      children = [createTextVNode(children as string)]
    } else {
      type = ShapeFlags.TEXT_CHILDREN
    }
  }

  vnode.children = children as VNodeNormalizedChildren
  vnode.shapeFlag |= type
}

export function mergeProps(...args: (Data & VNodeProps)[]) {
  const ret = extend({}, args[0])
  for (let i = 1; i < args.length; i++) {
    const toMerge = args[i]
    for (const key in toMerge) {
      if (key === 'class') {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class])
        }
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style])
      } else if (isOn(key)) {
        const existing = ret[key]
        const incoming = toMerge[key]
        if (existing !== incoming) {
          ret[key] = existing
            ? [].concat(existing as any, toMerge[key] as any)
            : incoming
        }
      } else if (key !== '') {
        ret[key] = toMerge[key]
      }
    }
  }
  return ret
}
