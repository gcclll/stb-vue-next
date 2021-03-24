import { ConcreteComponent } from './component'

export let isHmrUpdating = false

export const hmrDirtyComponents = new Set<ConcreteComponent>()
