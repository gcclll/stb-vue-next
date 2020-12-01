import { NOOP, isArray, isString } from '@vue/shared'
import {
  ExpressionNode,
  RootNode,
  NodeTypes,
  TemplateChildNode,
  JSChildNode,
  SimpleExpressionNode,
  CacheExpression,
  ElementNode,
  DirectiveNode,
  ParentNode,
  Property,
  TemplateLiteral
} from './ast'
import { defaultOnError } from './errors'
import { TransformOptions } from './options'
import { isSingleElementRoot } from './transforms/hoistStatic'
import {
  TO_DISPLAY_STRING,
  helperNameMap,
  CREATE_COMMENT,
  OPEN_BLOCK,
  CREATE_BLOCK
} from './runtimeHelpers'

// There are two types of transforms:
//
// - NodeTransform:
//   Transforms that operate directly on a ChildNode. NodeTransforms may mutate,
//   replace or remove the node being processed.
export type NodeTransform = (
  node: RootNode | TemplateChildNode,
  context: TransformContext
) => void | (() => void) | (() => void)[]

// - DirectiveTransform:
//   Transforms that handles a single directive attribute on an element.
//   It translates the raw directive into actual props for the VNode.
export type DirectiveTransform = (
  dir: DirectiveNode,
  node: ElementNode,
  context: TransformContext,
  // a platform specific compiler can import the base transform and augment
  // it by passing in this optional argument.
  augmentor?: (ret: DirectiveTransformResult) => DirectiveTransformResult
) => DirectiveTransformResult

export interface DirectiveTransformResult {
  props: Property[]
  needRuntime?: boolean | symbol
  ssrTagParts?: TemplateLiteral['elements']
}

export interface ImportItem {
  exp: string | ExpressionNode
  path: string
}

// A structural directive transform is a technically a NodeTransform;
// Only v-if and v-for fall into this category.
export type StructuralDirectiveTransform = (
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext
) => void | (() => void)

export interface TransformContext extends Required<TransformOptions> {
  root: RootNode
  helpers: Set<symbol>
  components: Set<string>
  directives: Set<string>
  hoists: (JSChildNode | null)[]
  imports: Set<ImportItem>
  temps: number
  cached: number
  identifiers: { [name: string]: number | undefined }
  scopes: {
    vFor: number
    vSlot: number
    vPre: number
    vOnce: number
  }
  parent: ParentNode | null
  childIndex: number
  currentNode: RootNode | TemplateChildNode | null
  helper<T extends symbol>(name: T): T
  helperString(name: symbol): string
  replaceNode(node: TemplateChildNode): void
  removeNode(node?: TemplateChildNode): void
  onNodeRemoved(): void
  addIdentifiers(exp: ExpressionNode | string): void
  removeIdentifiers(exp: ExpressionNode | string): void
  hoist(exp: JSChildNode): SimpleExpressionNode
  cache<T extends JSChildNode>(exp: T, isVNode?: boolean): CacheExpression | T
}

export function createTransformContext(
  root: RootNode,
  {
    prefixIdentifiers = false,
    hoistStatic = false,
    cacheHandlers = false,
    nodeTransforms = [],
    directiveTransforms = {},
    transformHoist = null,
    isBuiltInComponent = NOOP,
    isCustomElement = NOOP,
    expressionPlugins = [],
    scopeId = null,
    ssr = false,
    ssrCssVars = ``,
    bindingMetadata = {},
    onError = defaultOnError
  }: TransformOptions
): TransformContext {
  const context: TransformContext = {
    // options
    prefixIdentifiers,
    hoistStatic,
    cacheHandlers,
    nodeTransforms,
    directiveTransforms,
    transformHoist,
    isBuiltInComponent,
    isCustomElement,
    expressionPlugins,
    scopeId,
    ssr,
    ssrCssVars,
    bindingMetadata,
    onError,

    // state
    root,
    helpers: new Set(),
    components: new Set(),
    directives: new Set(),
    hoists: [],
    imports: new Set(),
    temps: 0,
    cached: 0,
    identifiers: Object.create(null),
    scopes: {
      vFor: 0,
      vSlot: 0,
      vPre: 0,
      vOnce: 0
    },
    parent: null,
    currentNode: root,
    childIndex: 0,

    // methods
    helper(name) {
      context.helpers.add(name)
      return name
    },
    helperString(name) {
      return `_${helperNameMap[context.helper(name)]}`
    },
    replaceNode(node) {},
    removeNode(node) {},
    onNodeRemoved: () => {},
    addIdentifiers(exp) {
      // TODO
    },
    removeIdentifiers(exp) {
      // TODO
    },
    hoist(exp) {
      // TODO
      return {} as any
    },
    cache(exp, isVNode = false) {
      // TODO
      return {} as any
    }
  }

  return context
}

export function transform(root: RootNode, options: TransformOptions) {
  const context = createTransformContext(root, options)
  traverseNode(root, context)
  if (options.hoistStatic) {
    // TODO hoist static nodes
  }

  if (!options.ssr) {
    createRootCodegen(root, context)
  }

  root.helpers = [...context.helpers]
  root.components = [...context.components]
  root.directives = [...context.directives]
  root.imports = [...context.imports]
  root.hoists = context.hoists
  root.temps = context.temps
  root.cached = context.cached
}

function createRootCodegen(root: RootNode, context: TransformContext) {
  const { helper } = context
  const { children } = root
  if (children.length === 1) {
    // 只有一个孩子节点，直接取该孩子节点 的 codegenNode
    const child = children[0]
    if (isSingleElementRoot(root, child) && child.codegenNode) {
      // 当 root 节点下只有一个 element 元素的孩子节点时，不进行提升
      const codegenNode = child.codegenNode
      if (codegenNode.type === NodeTypes.VNODE_CALL) {
        codegenNode.isBlock = true
        helper(OPEN_BLOCK)
        helper(CREATE_BLOCK)
      }

      root.codegenNode = codegenNode
    } else {
      // - single <slot/>, IfNode, ForNode: already blocks.
      // - single text node: always patched.
      // root codegen falls through via genNode()

      root.codegenNode = child
    }
  } else if (children.length > 1) {
    // TODO
  } else {
    // no children = noop, codegen will return null.
  }
}

export function traverseChildren(
  parent: ParentNode,
  context: TransformContext
) {
  let i = 0
  const nodeRemoved = () => {
    i--
  }

  for (; i < parent.children.length; i++) {
    const child = parent.children[i]
    if (isString(child)) continue
    context.parent = parent
    context.childIndex = i
    context.onNodeRemoved = nodeRemoved
    traverseNode(child, context)
  }
}

export function traverseNode(
  node: RootNode | TemplateChildNode,
  context: TransformContext
) {
  // 保存当前被处理的 节点
  context.currentNode = node
  // 应用 transform 插件
  const { nodeTransforms } = context
  // 针对每个节点会收集到一个或多个 transformXxx 函数，用来解析它的 ast
  // 得到 codegenNode ，这些函数会在当前的节点树被递归遍历完之后调用
  const exitFns = []
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }

    if (!context.currentNode) {
      // 节点可能被删除了，比如： v-else-if, v-else 会合并到 v-if 的 branches[] 中
      return
    } else {
      // 节点可能会替换了，需要更新
      node = context.currentNode
    }
  }

  switch (node.type) {
    // TODO
    case NodeTypes.COMMENT:
      if (!context.ssr) {
        // inject import for the Comment symbol, which is needed for creating
        // comment nodes with `createVNode`
        context.helper(CREATE_COMMENT)
      }
      break
    case NodeTypes.INTERPOLATION:
      // no need to traverse, but we need to inject toString helper
      if (!context.ssr) {
        context.helper(TO_DISPLAY_STRING)
      }
      break
    case NodeTypes.IF_BRANCH:
    case NodeTypes.FOR:
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
  }

  context.currentNode = node
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}

export function createStructuralDirectiveTransform(
  name: string | RegExp,
  fn: StructuralDirectiveTransform
): NodeTransform {
  return {} as any
}
