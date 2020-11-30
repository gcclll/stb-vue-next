// 合并相邻的文本节点(包含插值)
// Merge adjacent text nodes and expressions into a single expression

import { CompoundExpressionNode, ElementTypes, NodeTypes } from '../ast'
import { NodeTransform } from '../transform'

// e.g. <div>abc {{ d }} {{ e }}</div> should have a single expression node as child.
export const transformText: NodeTransform = (node, context) => {
  // 只有这四种类型才会收集这个函数
  if (
    node.type === NodeTypes.ROOT ||
    node.type === NodeTypes.ELEMENT ||
    node.type === NodeTypes.FOR ||
    node.type === NodeTypes.IF_BRANCH
  ) {
    // perform the transform on node exit so that all expressions have already
    // been processed.
    return () => {
      const children = node.children
      // let currentContainer: CompoundExpressionNode | undefined = undefined
      let hasText = false

      // 遍历所有孩子节点，合并文本
      for (let i = 0; i < children.length; i++) {
        // TODO
      }

      // 不处理的几种情况
      // 1. hasText = false ，压根没有文本节点
      // 2. 只有一个 child 且类型必须是 ROOT 或 type, tagType 都是 ELEMENT的标签
      if (
        !hasText ||
        (children.length === 1 &&
          (node.type === NodeTypes.ROOT ||
            (node.type === NodeTypes.ELEMENT &&
              node.tagType === ElementTypes.ELEMENT)))
      ) {
        return
      }

      // 将文本节点转换成用 createTextVNode(text) 创建
      for (let i = 0; i < children.length; i++) {
        // TODO
      }
    }
  }
}
