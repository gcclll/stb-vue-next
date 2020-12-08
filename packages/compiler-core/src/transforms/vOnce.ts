import { ElementNode, ForNode, IfNode, NodeTypes } from '../ast'
import { SET_BLOCK_TRACKING } from '../runtimeHelpers'
import { NodeTransform } from '../transform'
import { findDir } from '../utils'

const seen = new WeakSet()

export const transformOnce: NodeTransform = (node, context) => {
  if (node.type === NodeTypes.ELEMENT && findDir(node, 'once', true)) {
    // 缓存实现 v-once，就算有数据更新也不会重新生成 render 函数
    if (seen.has(node)) {
      return
    }
    seen.add(node)
    context.helper(SET_BLOCK_TRACKING)
    return () => {
      const cur = context.currentNode as ElementNode | IfNode | ForNode
      if (cur.codegenNode) {
        cur.codegenNode = context.cache(cur.codegenNode, true /* isVNode */)
      }
    }
  }
}
