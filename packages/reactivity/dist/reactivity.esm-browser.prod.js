const e = {},
  t = Object.prototype.toString,
  n = e => (e => t.call(e))(e).slice(8, -1),
  r = new WeakMap(),
  c = []
let i
function u(t, n = e) {
  ;(function(e) {
    return e && !0 === e._isEffect
  })(t) && (t = t.raw)
  const r = (function(e, t) {
    const n = function() {
      if (!n.active) return t.scheduler ? void 0 : e()
      if (!c.includes(n)) {
        !(function(e) {
          const { deps: t } = e
          if (t.length) {
            for (let n = 0; n < t.length; n++) t[n].delete(e)
            t.length = 0
          }
        })(n)
        try {
          return f(), c.push(n), (i = n), e()
        } finally {
          c.pop(), l(), (i = c[c.length - 1])
        }
      }
    }
    return (
      (n.id = o++),
      (n.allowRecurse = !!t.allowRecurse),
      (n._isEffect = !0),
      (n.active = !0),
      (n.raw = e),
      (n.deps = []),
      (n.options = t),
      n
    )
  })(t, n)
  return n.lazy || r(), r
}
let o = 0
let s = !0
const a = []
function f() {
  a.push(s), (s = !0)
}
function l() {
  const e = a.pop()
  s = void 0 === e || e
}
function _(e, t, n) {
  if (!s || void 0 === i) return
  let c = r.get(e)
  c || r.set(e, (c = new Map()))
  let u = c.get(n)
  u || c.set(n, (u = new Set())), u.has(i) || (u.add(i), i.deps.push(u))
}
function p(e, t, n, r, c, i) {}
function v(e = !1, t = !1) {
  return function(t, n, r) {
    const c = Reflect.get(t, n, r)
    return e || _(t, 0, n), c
  }
}
const d = { get: v() },
  w = new WeakMap(),
  g = new WeakMap()
function h(e) {
  return e && e.__v_isReadonly
    ? e
    : (function(e, t, r, c) {
        if (((i = e), null === i || 'object' != typeof i)) return e
        var i
        if (e.__v_raw && (!t || !e.__v_isReactive)) return e
        const u = t ? g : w,
          o = u.get(e)
        if (o) return o
        const s = ((a = e),
        a.__v_skip || !Object.isExtensible(a)
          ? 0
          : (function(e) {
              switch (e) {
                case 'Object':
                case 'Array':
                  return 1
                case 'Map':
                case 'Set':
                case 'WeakMap':
                case 'WeakSet':
                  return 2
                default:
                  return 0
              }
            })(n(a)))
        var a
        if (0 === s) return e
        const f = new Proxy(e, 2 === s ? c : r)
        return u.set(e, f), f
      })(e, !1, d, {})
}
function y(e) {
  return b(e) ? y(e.__v_raw) : !(!e || !e.__v_isReactive)
}
function b(e) {
  return !(!e || !e.__v_isReadonly)
}
function k(e) {
  return y(e) || b(e)
}
function R(e) {
  return (e && R(e.__v_raw)) || e
}
function M(e) {
  return (
    ((e, t, n) => {
      Object.defineProperty(e, t, {
        configurable: !0,
        enumerable: !1,
        value: n
      })
    })(e, '__v_skip', !0),
    e
  )
}
export {
  u as effect,
  f as enableTracking,
  k as isProxy,
  y as isReactive,
  b as isReadonly,
  M as markRaw,
  h as reactive,
  l as resetTracking,
  r as targetMap,
  R as toRaw,
  _ as track,
  p as trigger
}
