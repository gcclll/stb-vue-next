import { isString, hyphenate, capitalize, isArray } from '@vue/shared'
import { camelize } from '@vue/runtime-core'

type Style = string | Record<string, string | string[]> | null

export function patchStyle(el: Element, prev: Style, next: Style) {
  const style = (el as HTMLElement).style

  if (!next) {
    // 删除操作
    el.removeAttribute('style')
  } else if (isString(next)) {
    // 更新操作，全替换操作
    if (prev !== next) {
      style.cssText = next
    }
  } else {
    // 如果是对象，根据对象内的属性逐个进行更新
    for (const key in next) {
      // 更新单个值
      setStyle(style, key, next[key])
    }

    if (prev && !isString(prev)) {
      // 删除老的不在 next 中的值
      for (const key in prev) {
        if (next[key] == null) {
          setStyle(style, key, '')
        }
      }
    }
  }
}

const importantRE = /\s*!important$/

function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[]
) {
  if (isArray(val)) {
    // 同一个属性设置多个值？取最后一个有效值
    val.forEach(v => setStyle(style, name, v))
  } else {
    // 多浏览器的兼容处理，如： --webkit-...
    if (name.startsWith('--')) {
      // custom property definition
      style.setProperty(name, val)
    } else {
      // 自动添加前缀
      const prefixed = autoPrefix(style, name)
      if (importantRE.test(val)) {
        // 优先级最高的处理
        // !important
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important'
        )
      } else {
        style[prefixed as any] = val
      }
    }
  }
}

const prefixes = ['Webkit', 'Moz', 'ms']
const prefixCache: Record<string, string> = {}

// 自动添加前缀处理
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  const cached = prefixCache[rawName]
  if (cached) {
    return cached
  }
  let name = camelize(rawName)
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name)
  }
  name = capitalize(name)
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed)
    }
  }
  return rawName
}
