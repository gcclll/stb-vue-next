export const enum NodeTypes {
  TEXT = 'text',
  ELEMENT = 'element',
  COMMENT = 'comment'
}

// node 操作类型
export const enum NodeOpTypes {
  CREATE = 'create',
  INSERT = 'insert',
  REMOVE = 'remove',
  SET_TEXT = 'setText',
  SET_ELEMENT_TEXT = 'setElementText',
  PATCH = 'patch'
}

export interface TestElement {
  id: number
  type: NodeTypes.ELEMENT
  parentNode: TestElement | null
  tag: string
  children: TestNode[]
  props: Record<string, any>
  eventListeners: Record<string, Function | Function[]> | null
}

export interface TestText {
  id: number
  type: NodeTypes.TEXT
  parentNode: TestElement | null
  text: string
}

export interface TestComment {
  id: number
  type: NodeTypes.COMMENT
  parentNode: TestElement | null
  text: string
}

export type TestNode = TestElement | TestText | TestComment

export interface NodeOp {
  type: NodeOpTypes
  nodeType?: NodeTypes
  tag?: string
  text?: string
  targetNode?: TestNode
  parentNode?: TestElement
  refNode?: TestNode | null
  propKey?: string
  propPrevValue?: any
  propNextValue?: any
}
