import {
  buildSlots,
  buildProps,
  CallExpression,
  CompilerOptions,
  SlotFnBuilder,
  getBaseTransformPreset,
  ComponentNode,
  createFunctionExpression,
  createCallExpression,
  createTransformContext,
  createReturnStatement,
  traverseNode,
  createRoot,
  DOMDirectiveTransforms,
  DOMNodeTransforms,
  locStub,
  ElementTypes,
  createIfStatement,
  createSimpleExpression,
  ExpressionNode,
  FunctionExpression,
  Namespaces,
  TransformOptions,
  NodeTransform,
  NodeTypes,
  resolveComponentType,
  ReturnStatement,
  RootNode,
  SUSPENSE,
  TELEPORT,
  TRANSITION_GROUP,
  TemplateChildNode,
  TemplateNode,
  TransformContext,
  CREATE_VNODE
} from '@vue/compiler-dom'
import {
  SSRTransformContext,
  processChildren,
  processChildrenAsStatement
} from '../ssrCodegenTransform'
import { isArray, isObject, isSymbol } from '@vue/shared'
import { SSR_RENDER_COMPONENT, SSR_RENDER_VNODE } from '../runtimeHelpers'
import {
  ssrProcessSuspense,
  ssrTransformSuspense
} from './ssrTransformSuspense'
import { ssrProcessTeleport } from './ssrTransformTeleport'
import { ssrProcessTransitionGroup } from './ssrTransformTransitionGroup'

// We need to construct the slot functions in the 1st pass to ensure proper
// scope tracking, but the children of each slot cannot be processed until
// the 2nd pass, so we store the WIP slot functions in a weakmap during the 1st
// pass and complete them in the 2nd pass.
// 第一阶段构造 slot 函数，但是每个 slot 的 childgen 只能在第二阶段完成，
// 所以需要先将这些 slot 函数保存起来待第二阶段去完成
const wipMap = new WeakMap<ComponentNode, WIPSlotEntry[]>()

interface WIPSlotEntry {
  fn: FunctionExpression
  children: TemplateChildNode[]
  vnodeBranch: ReturnStatement
}

const componentTypeMap = new WeakMap<
  ComponentNode,
  string | symbol | CallExpression
>()

// ssr component transform is done in two phases:
// In phase 1. we use `buildSlot` to analyze the children of the component into
// WIP slot functions (it must be done in phase 1 because `buildSlot` relies on
// the core transform context).
// In phase 2. we convert the WIP slots from phase 1 into ssr-specific codegen
// nodes.
// 说白了就是先经过 core 中的 buildSlot 分析组件的孩子节点成 slot function
// 然后在 ssr 中进一步做处理
export const ssrTransformComponent: NodeTransform = (node, context) => {
  // 必须是 <Comp/> 组件
  if (
    node.type !== NodeTypes.ELEMENT ||
    node.tagType !== ElementTypes.COMPONENT
  ) {
    return
  }

  // 1. <component is="xx">
  // 2. KeepAlive,Teleport,Transition,Suspense 内置组件
  // 3. 用户组件 setup 中绑定的组件
  // 4. Self referencing component
  // 5. user component(resolve)
  const component = resolveComponentType(node, context, true /* ssr */)
  componentTypeMap.set(node, component)

  if (isSymbol(component)) {
    if (component === SUSPENSE) {
      return ssrTransformSuspense(node, context)
    }
    return // built-in component: fallthrough
  }

  // Build the fallback vnode-based branch for the component's slots.
  // We need to clone the node into a fresh copy and use the buildSlots' logic
  // to get access to the children of each slot. We then compile them with
  // a child transform pipeline using vnode-based transforms (instead of ssr-
  // based ones), and save the result branch (a ReturnStatement) in an array.
  // The branch is retrieved when processing slots again in ssr mode.
  const vnodeBranches: ReturnStatement[] = []
  const clonedNode = clone(node)

  return function ssrPostTransformComponent() {
    // Using the cloned node, build the normal VNode-based branches (for
    // fallback in case the child is render-fn based). Store them in an array
    // for later use.
    if (clonedNode.children.length) {
      buildSlots(clonedNode, context, (props, children) => {
        vnodeBranches.push(createVNodeSlotBranch(props, children, context))
        return createFunctionExpression(undefined)
      })
    }

    const props =
      node.props.length > 0
        ? // note we are not passing ssr: true here because for components, v-on
          // handlers should still be passed
          // 对于 component v-on 依旧有效
          buildProps(node, context).props || `null`
        : `null`

    const wipEntries: WIPSlotEntry[] = []
    wipMap.set(node, wipEntries)

    const buildSSRSlotFn: SlotFnBuilder = (props, children, loc) => {
      const fn = createFunctionExpression(
        [props || `_`, `_push`, `_parent`, `_scopeId`],
        undefined, // no return, assign body later
        true, // newline
        true, // isSlot
        loc
      )
      wipEntries.push({
        fn,
        children,
        // also collect the corresponding vnode branch built earlier
        vnodeBranch: vnodeBranches[wipEntries.length]
      })
      return fn
    }

    const slots = node.children.length
      ? buildSlots(node, context, buildSSRSlotFn).slots
      : `null`

    if (typeof component !== 'string') {
      // dynamic component that resolved to a `resolveDynamicComponent` call
      // expression - since the resolved result may be a plain element (string)
      // or a VNode, handle it with `renderVNode`.
      // 动态组件处理
      node.ssrCodegenNode = createCallExpression(
        context.helper(SSR_RENDER_VNODE),
        [
          `_push`,
          createCallExpression(context.helper(CREATE_VNODE), [
            component,
            props,
            slots
          ]),
          `_parent`
        ]
      )
    } else {
      node.ssrCodegenNode = createCallExpression(
        context.helper(SSR_RENDER_COMPONENT),
        [component, props, slots, `_parent`]
      )
    }
  }
}
export function ssrProcessComponent(
  node: ComponentNode,
  context: SSRTransformContext
) {
  const component = componentTypeMap.get(node)!
  if (!node.ssrCodegenNode) {
    // this is a built-in component that fell-through.
    if (component === TELEPORT) {
      return ssrProcessTeleport(node, context)
    } else if (component === SUSPENSE) {
      return ssrProcessSuspense(node, context)
    } else if (component === TRANSITION_GROUP) {
      return ssrProcessTransitionGroup(node, context)
    } else {
      // real fall-through (e.g. KeepAlive): just render its children.
      processChildren(node.children, context)
    }
  } else {
    // finish up slot function expressions from the 1st pass.

    const wipEntries = wipMap.get(node) || []
    for (let i = 0; i < wipEntries.length; i++) {
      const { fn, children, vnodeBranch } = wipEntries[i]
      // For each slot, we generate two branches: one SSR-optimized branch and
      // one normal vnode-based branch. The branches are taken based on the
      // presence of the 2nd `_push` argument (which is only present if the slot
      // is called by `_ssrRenderSlot`.
      fn.body = createIfStatement(
        createSimpleExpression(`_push`, false),
        processChildrenAsStatement(
          children,
          context,
          false,
          true /* withSlotScopeId */
        ),
        vnodeBranch
      )
    }

    if (typeof component === 'string') {
      // 静态组件
      context.pushStatement(
        createCallExpression(`_push`, [node.ssrCodegenNode])
      )
    } else {
      // dynamic component (`resolveDynamicComponent` call)
      // the codegen node is a `renderVNode` call
      context.pushStatement(node.ssrCodegenNode)
    }
  }
}

export const rawOptionsMap = new WeakMap<RootNode, CompilerOptions>()

const [baseNodeTransforms, baseDirectiveTransforms] = getBaseTransformPreset(
  true
)
const vnodeNodeTransforms = [...baseNodeTransforms, ...DOMNodeTransforms]
const vnodeDirectiveTransforms = {
  ...baseDirectiveTransforms,
  ...DOMDirectiveTransforms
}

function createVNodeSlotBranch(
  props: ExpressionNode | undefined,
  children: TemplateChildNode[],
  parentContext: TransformContext
): ReturnStatement {
  // apply a sub-transform using vnode-based transforms.

  // 缓存？
  const rawOptions = rawOptionsMap.get(parentContext.root)!
  const subOptions = {
    ...rawOptions,
    // overwrite with vnode-based transforms
    nodeTransforms: [
      ...vnodeNodeTransforms,
      ...(rawOptions.nodeTransforms || [])
    ],
    directiveTransforms: {
      ...vnodeDirectiveTransforms,
      ...(rawOptions.directiveTransforms || {})
    }
  }

  // wrap the children with a wrapper template for proper children treatment.
  // 用 template 将 children 包裹起来
  const wrapperNode: TemplateNode = {
    type: NodeTypes.ELEMENT,
    ns: Namespaces.HTML,
    tag: 'template',
    tagType: ElementTypes.TEMPLATE,
    isSelfClosing: false,
    // important: provide v-slot="props" on the wrapper for proper
    // scope analysis
    props: [
      {
        type: NodeTypes.DIRECTIVE,
        name: 'slot',
        exp: props,
        arg: undefined,
        modifiers: [],
        loc: locStub
      }
    ],
    children,
    loc: locStub,
    codegenNode: undefined
  }
  subTransform(wrapperNode, subOptions, parentContext)
  return createReturnStatement(children)
}

function subTransform(
  node: TemplateChildNode,
  options: TransformOptions,
  parentContext: TransformContext
) {
  const childRoot = createRoot([node])
  const childContext = createTransformContext(childRoot, options)
  // this sub transform is for vnode fallback branch so it should be handled
  // like normal render functions
  childContext.ssr = false

  // inherit parent scope analysis state
  childContext.scopes = { ...parentContext.scopes }
  childContext.identifiers = { ...parentContext.identifiers }

  //traverse
  traverseNode(childRoot, childContext)
  // merge helpers/components/directives/imports into parent context
  ;(['helpers', 'components', 'directives', 'imports'] as const).forEach(
    key => {
      childContext[key].forEach((value: any) => {
        ;(parentContext[key] as any).add(value)
      })
    }
  )
}

function clone(v: any): any {
  if (isArray(v)) {
    return v.map(clone)
  } else if (isObject(v)) {
    const res: any = {}
    for (const key in v) {
      res[key] = clone(v[key])
    }
    return res
  } else {
    return v
  }
}
