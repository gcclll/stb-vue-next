import {
  toRaw,
  shallowReactive,
  trigger,
  TriggerOpTypes
} from '@vue/reactivity'
import {
  EMPTY_OBJ,
  camelize,
  hyphenate,
  capitalize,
  isString,
  isFunction,
  isArray,
  isObject,
  hasOwn,
  toRawType,
  PatchFlags,
  makeMap,
  isReservedProp,
  EMPTY_ARR,
  def,
  extend
} from '@vue/shared'
import { warn } from './warning'
import {
  Data,
  ComponentInternalInstance,
  ComponentOptions,
  ConcreteComponent,
  setCurrentInstance
} from './component'
import { isEmitListener } from './componentEmits'
import { InternalObjectKey } from './vnode'
import { AppContext } from './apiCreateApp'

export type ComponentPropsOptions<P = Data> =
  | ComponentObjectPropsOptions<P>
  | string[]

export type ComponentObjectPropsOptions<P = Data> = {
  [K in keyof P]: Prop<P[K]> | null
}

export type Prop<T, D = T> = PropOptions<T, D> | PropType<T>

type DefaultFactory<T> = (props: Data) => T | null | undefined

interface PropOptions<T = any, D = T> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: D | DefaultFactory<D> | null | undefined | object
  validator?(value: unknown): boolean
}

export type PropType<T> = PropConstructor<T> | PropConstructor<T>[]

type PropConstructor<T = any> =
  | { new (...args: any[]): T & object }
  | { (): T }
  | PropMethod<T>

type PropMethod<T, TConstructor = any> = T extends (...args: any) => any // if is function with args
  ? { new (): TConstructor; (): T; readonly prototype: TConstructor } // Create Function like constructor
  : never

type RequiredKeys<T> = {
  [K in keyof T]: T[K] extends
    | { required: true }
    | { default: any }
    // don't mark Boolean props as undefined
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? K
    : never
}[keyof T]

type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>

type DefaultKeys<T> = {
  [K in keyof T]: T[K] extends
    | { default: any }
    // Boolean implicitly defaults to false
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { type: BooleanConstructor; required: true } // not default if Boolean is marked as required
      ? never
      : K
    : never
}[keyof T]

type InferPropType<T> = T extends null
  ? any // null & true would fail to infer
  : T extends { type: null | true }
    ? any // As TS issue https://github.com/Microsoft/TypeScript/issues/14829 // somehow `ObjectConstructor` when inferred from { (): T } becomes `any` // `BooleanConstructor` when inferred from PropConstructor(with PropMethod) becomes `Boolean`
    : T extends ObjectConstructor | { type: ObjectConstructor }
      ? Record<string, any>
      : T extends BooleanConstructor | { type: BooleanConstructor }
        ? boolean
        : T extends Prop<infer V, infer D> ? (unknown extends V ? D : V) : T

export type ExtractPropTypes<O> = O extends object
  ? { [K in RequiredKeys<O>]: InferPropType<O[K]> } &
      { [K in OptionalKeys<O>]?: InferPropType<O[K]> }
  : { [K in string]: any }

const enum BooleanFlags {
  shouldCast,
  shouldCastTrue
}

// extract props which defined with default from prop options
export type ExtractDefaultPropTypes<O> = O extends object
  ? { [K in DefaultKeys<O>]: InferPropType<O[K]> }
  : {}

type NormalizedProp =
  | null
  | (PropOptions & {
      [BooleanFlags.shouldCast]?: boolean
      [BooleanFlags.shouldCastTrue]?: boolean
    })

// normalized value is a tuple of the actual normalized options
// and an array of prop keys that need value casting (booleans and defaults)
export type NormalizedProps = Record<string, NormalizedProp>
export type NormalizedPropsOptions = [NormalizedProps, string[]] | []

export function initProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  isStateful: number,
  isSSR = false
) {
  const props: Data = {}
  const attrs: Data = {}
  def(attrs, InternalObjectKey, 1)
  setFullProps(instance, rawProps, props, attrs)
  // TODO validation

  if (isStateful) {
    instance.props = isSSR ? props : shallowReactive(props)
  } else {
    if (!instance.type.props) {
      // functional optional props, props === attrs
      instance.props = attrs
    } else {
      // functional declared props
      instance.props = props
    }
  }
  instance.attrs = attrs
}

export function updateProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  rawPrevProps: Data | null,
  optimized: boolean
) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance
  const rawCurrentProps = toRaw(props)
  const [options] = instance.propsOptions

  if (
    // 开发模式下，总是强制进行 full diff
    !(
      __DEV__ &&
      (instance.type.__hmrId ||
        (instance.parent && instance.parent.type.__hmrId))
    ) &&
    (optimized || patchFlag > 0) &&
    !(patchFlag & PatchFlags.FULL_PROPS)
  ) {
    if (patchFlag & PatchFlags.PROPS) {
      const propsToUpdate = instance.vnode.dynamicProps!
      for (let i = 0; i < propsToUpdate.length; i++) {
        const key = propsToUpdate[i]
        const value = rawProps![key]
        if (options) {
          // attr / props 在初始化阶段会被分离开，在这里只需要检测
          // attrs 有没有该属性
          if (hasOwn(attrs, key)) {
            attrs[key] = value
          } else {
            const camelizedKey = camelize(key)
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance
            )
          }
        } else {
          attrs[key] = value
        }
      }
    }
  } else {
    // full props update
    setFullProps(instance, rawProps, props, attrs)
    // in case of dynamic props, check if we need to delete keys from
    // the props object
    let kebabKey: string
    for (const key in rawCurrentProps) {
      if (
        !rawProps ||
        // for camelcase
        (!hasOwn(rawProps, key) &&
          ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey)))
      ) {
        if (options) {
          if (
            rawPrevProps &&
            // for camelCase
            (rawPrevProps[key] !== undefined ||
              // for kebad-case
              rawPrevProps[kebabKey!] !== undefined)
          ) {
            props[key] = resolvePropValue(
              options,
              rawProps || EMPTY_OBJ,
              key,
              undefined,
              instance
            )
          }
        } else {
          delete props[key]
        }
      }
    }

    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key)) {
          delete attrs[key]
        }
      }
    }
  }

  // trigger updates for $attrs in case it's used in component slots
  trigger(instance, TriggerOpTypes.SET, '$attrs')
}

function setFullProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  props: Data,
  attrs: Data
) {
  const [options, needCastKeys] = instance.propsOptions
  if (rawProps) {
    for (const key in rawProps) {
      const value = rawProps[key]
      // key, ref 保留，不往下传
      // 即这两个属性不会继承给 child
      if (isReservedProp(key)) {
        continue
      }

      let camelKey
      if (options && hasOwn(options, (camelKey = camelize(key)))) {
        props[camelKey] = value
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        attrs[key] = value
      }
    }
  }

  if (needCastKeys) {
    const rawCurrentProps = toRaw(props)
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i]
      props[key] = resolvePropValue(
        options!,
        rawCurrentProps,
        key,
        rawCurrentProps[key],
        instance
      )
    }
  }
}

function resolvePropValue(
  options: NormalizedProps,
  props: Data,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance
) {
  /*
   * 这里面的处理是针对 props: { name: { ... } } 类型而言
   * 1. 默认值的处理， default 可能是函数或普通类型值，如果是函数应该得到
   * 函数执行的结果作为它的值，注意下面的检测函数时前置条件是该类型不是函数，
   * 如果类型也是函数，默认值就是该函数本身，而非执行后的结果值
   * 2. 布尔值的处理，值转成 true or false
   */
  const opt = options[key]
  if (opt != null) {
    const hasDefault = hasOwn(opt, 'default')
    // 默认值
    if (hasDefault && value === undefined) {
      const defaultValue = opt.default
      // props: { name: { default: (props) => 'xxx' } }
      // 类型不是函数？但是默认值是函数，执行得到结果
      if (opt.type !== Function && isFunction(defaultValue)) {
        setCurrentInstance(instance)
        value = defaultValue(props)
        setCurrentInstance(null)
      } else {
        // props: { name: { default: 'xxx' } }
        value = defaultValue
      }
    }
    // boolean casting
    if (opt[BooleanFlags.shouldCast]) {
      if (!hasOwn(props, key) && !hasDefault) {
        value = false
      } else if (
        opt[BooleanFlags.shouldCastTrue] &&
        (value === '' || value === hyphenate(key))
      ) {
        value = true
      }
    }
  }
  return value
}

export function normalizePropsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false
): NormalizedPropsOptions {
  if (!appContext.deopt && comp.__props) {
    return comp.__props
  }

  const raw = comp.props
  const normalized: NormalizedPropsOptions[0] = {}
  const needCastKeys: NormalizedPropsOptions[1] = []

  // mixin/extends props 应用
  let hasExtends = false
  // 必须开支 2.x options api 支持，且不是函数式组件
  // 继承来的属性，用法： ~CompA = { extends: CompB, ... }~
  // CompA 会继承 CompB 的 props
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    const extendProps = (raw: ComponentOptions) => {
      hasExtends = true
      const [props, keys] = normalizePropsOptions(raw, appContext, true)
      extend(normalized, props)
      if (keys) {
        needCastKeys.push(...keys)
      }
    }

    // Comp: { mixins: [mixin] } 处理
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps)
    }

    // Comp: { extends: CompA } 处理
    if (comp.extends) {
      extendProps(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps)
    }
  }

  // 既没有自身的 props 也没有 extends 继承来的 props 初始化为 []
  if (!raw && !hasExtends) {
    return (comp.__props = EMPTY_ARR as any)
  }

  if (isArray(raw)) {
    // 当 props 是数组的时候，必须是字符类型，如: props: ['foo', 'bar', 'foo-bar']
    // 'foo-bar' 会转成 'fooBar'，不允许 '$xxx' 形式的变量名
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i])
      // 组件的属性名不能是以 $xx 开头的名称，这个是作为内部属性的
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ
      }
    }
  } else if (raw) {
    // 对象类型 props: { foo: 1, bar: 2, ... }
    for (const key in raw) {
      // 'foo-bar' -> 'fooBar'
      const normalizedKey = camelize(key)
      // 检查 $xxx 非法属性
      if (validatePropName(normalizedKey)) {
        const opt = raw[key]
        // ? 值为数组或函数变成： { type: opt } ?
        // 这里含义其实是： ~props: { foo: [Boolean, Function] }~
        // 可以用数组定义该属性可以是多种类型的其中一种
        const prop: NormalizedProp = (normalized[normalizedKey] =
          isArray(opt) || isFunction(opt) ? { type: opt } : opt)
        if (prop) {
          // 找到 Boolean 在 foo: [Boolean, Function] 中的索引
          const booleanIndex = getTypeIndex(Boolean, prop.type)
          const stringIndex = getTypeIndex(String, prop.type)
          prop[BooleanFlags.shouldCast] = booleanIndex > -1
          // [String, Boolean] 类型，String 在 Boolean 前面
          prop[BooleanFlags.shouldCastTrue] =
            stringIndex < 0 || booleanIndex < stringIndex
          // 如果是布尔类型的值或者有默认值的属性需要转换
          // 转换是根据 type 和 default 值处理
          // type非函数，default是函数，执行 default() 得到默认值
          if (booleanIndex > -1 || hasOwn(prop, 'default')) {
            needCastKeys.push(normalizedKey)
          }
        }
      }
    }
  }

  return (comp.__props = [normalized, needCastKeys])
}

function validatePropName(key: string) {
  // 非内部属性？
  if (key[0] !== '$') {
    return true
  } else if (__DEV__) {
    // $xxx 为保留属性
    warn(`Invalid prop name: "${key}" is a reserved property.`)
  }
  return false
}

// use function string name to check type constructors
// so that it works across vms / iframes.
function getType(ctor: Prop<any>): string {
  const match = ctor && ctor.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType(a: Prop<any>, b: Prop<any>): boolean {
  return getType(a) === getType(b)
}

function getTypeIndex(
  type: Prop<any>,
  expectedTypes: PropType<any> | void | null | true
): number {
  if (isArray(expectedTypes)) {
    for (let i = 0, len = expectedTypes.length; i < len; i++) {
      if (isSameType(expectedTypes[i], type)) {
        return i
      }
    }
  } else if (isFunction(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  return -1
}

type AssertionResult = {
  valid: boolean
  expectedType: string
}
