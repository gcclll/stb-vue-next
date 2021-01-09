// Core API ------------------------------------------------------------------

export const version = __VERSION__
export {
  // core
  reactive,
  ref,
  readonly,
  // utilities
  unref,
  proxyRefs,
  isRef,
  toRef,
  toRefs,
  isProxy,
  isReactive,
  isReadonly,
  // advanced
  customRef,
  triggerRef,
  shallowRef,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw
} from '@vue/reactivity'

// Advanced API ----------------------------------------------------------------
export { h } from './h'
// Advanced render function utilities
export { createVNode, isVNode, cloneVNode, mergeProps } from './vnode'
// VNodet types
export { Fragment, Text, Comment, Static } from './vnode'
// Built-in components
export { Teleport, TeleportProps } from './components/Teleport'
export { Suspense, SuspenseProps } from './components/Suspense'
export { KeepAliveProps } from './components/KeepAlive'
export { BaseTransitionProps } from './components/BaseTransition'

// Custom Renderer API ---------------------------------------------------------
export { warn } from './warning'
export {
  handleError,
  callWithErrorHandling,
  callWithAsyncErrorHandling,
  ErrorCodes
} from './errorHandling'

// Types -------------------------------------------------------------------------
import { VNode } from './vnode'
import { ComponentInternalInstance } from './component'

// Augment Ref unwrap bail types.
// Note: if updating this, also update `types/refBail.d.ts`.
declare module '@vue/reactivity' {
  export interface RefUnwrapBailTypes {
    runtimeCoreBailTypes:
      | VNode
      | {
          // directly bailing on ComponentPublicInstance results in recursion
          // so we use this as a bail hint
          $: ComponentInternalInstance
        }
  }
}

export {
  ReactiveEffect,
  ReactiveEffectOptions,
  DebuggerEvent,
  TrackOpTypes,
  TriggerOpTypes,
  Ref,
  ComputedRef,
  WritableComputedRef,
  UnwrapRef,
  ShallowUnwrapRef,
  WritableComputedOptions,
  ToRefs,
  DeepReadonly
} from '@vue/reactivity'

export {
  WatchEffect,
  WatchOptions,
  WatchOptionsBase,
  WatchCallback,
  WatchSource,
  WatchStopHandle
} from './apiWatch'
export { InjectionKey } from './apiInject'
export {
  App,
  AppConfig,
  AppContext,
  Plugin,
  CreateAppFunction,
  OptionMergeFunction
} from './apiCreateApp'
export {
  VNode,
  VNodeChild,
  VNodeTypes,
  VNodeProps,
  VNodeArrayChildren,
  VNodeNormalizedChildren
} from './vnode'
export {
  Component,
  ConcreteComponent,
  FunctionalComponent,
  SetupContext,
  ComponentCustomProps,
  AllowedComponentProps
} from './component'
export { DefineComponent } from './apiDefineComponent'
export {
  ComponentOptions,
  ComponentOptionsMixin,
  ComponentOptionsWithoutProps,
  ComponentOptionsWithObjectProps,
  ComponentOptionsWithArrayProps,
  ComponentCustomOptions,
  RenderFunction,
  MethodOptions,
  ComputedOptions
} from './componentOptions'
export { EmitsOptions, ObjectEmitsOptions } from './componentEmits'
export {
  ComponentPublicInstance,
  ComponentCustomProperties
} from './componentPublicInstance'
export {
  Renderer,
  RendererNode,
  RendererElement,
  HydrationRenderer,
  RendererOptions,
  RootRenderFunction
} from './renderer'
export { RootHydrateFunction } from './hydration'
export { Slot, Slots } from './componentSlots'
export {
  Prop,
  PropType,
  ComponentPropsOptions,
  ComponentObjectPropsOptions,
  ExtractPropTypes,
  ExtractDefaultPropTypes
} from './componentProps'
export {
  Directive,
  DirectiveBinding,
  DirectiveHook,
  ObjectDirective,
  FunctionDirective,
  DirectiveArguments
} from './directives'
export { SuspenseBoundary } from './components/Suspense'
export { TransitionState, TransitionHooks } from './components/BaseTransition'
export {
  AsyncComponentOptions,
  AsyncComponentLoader
} from './apiAsyncComponent'

// Internal API ----------------------------------------------------------------

// **IMPORTANT** Internal APIs may change without notice between versions and
// user code should avoid relying on them.

// For compiler generated code
// should sync with '@vue/compiler-core/src/runtimeConstants.ts'
export { createTextVNode } from './vnode'

export {
  toDisplayString,
  camelize,
  capitalize,
  toHandlerKey
} from '@vue/shared'

// For test-utils
export { transformVNodeArgs } from './vnode'

// SSR -------------------------------------------------------------------------
// **IMPORTANT** These APIs are exposed solely for @vue/server-renderer and may
// change without notice between versions. User code should never rely on them.

import { setCurrentRenderingInstance } from './componentRenderUtils'
import { isVNode } from './vnode'

const _ssrUtils = {
  isVNode,
  setCurrentRenderingInstance
}

/**
 * SSR utils for \@vue/server-renderer. Only exposed in cjs builds.
 * @internal
 */
export const ssrUtils = (__NODE_JS__ ? _ssrUtils : null) as typeof _ssrUtils
