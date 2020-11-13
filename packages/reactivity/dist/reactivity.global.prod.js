var VueReactivity = (function(e) {
  'use strict'
  const t = {},
    n = Object.prototype.toString,
    r = e => (e => n.call(e))(e).slice(8, -1),
    c = new WeakMap(),
    i = []
  let u
  let a = 0
  let o = !0
  const s = []
  function f() {
    s.push(o), (o = !0)
  }
  function l() {
    const e = s.pop()
    o = void 0 === e || e
  }
  function _(e, t, n) {
    if (!o || void 0 === u) return
    let r = c.get(e)
    r || c.set(e, (r = new Map()))
    let i = r.get(n)
    i || r.set(n, (i = new Set())), i.has(u) || (i.add(u), u.deps.push(i))
  }
  function p(e = !1, t = !1) {
    return function(t, n, r) {
      const c = Reflect.get(t, n, r)
      return e || _(t, 0, n), c
    }
  }
  const v = { get: p() },
    d = new WeakMap(),
    g = new WeakMap()
  function w(e) {
    return y(e) ? w(e.__v_raw) : !(!e || !e.__v_isReactive)
  }
  function y(e) {
    return !(!e || !e.__v_isReadonly)
  }
  return (
    (e.effect = function(e, n = t) {
      ;(function(e) {
        return e && !0 === e._isEffect
      })(e) && (e = e.raw)
      const r = (function(e, t) {
        const n = function() {
          if (!n.active) return t.scheduler ? void 0 : e()
          if (!i.includes(n)) {
            !(function(e) {
              const { deps: t } = e
              if (t.length) {
                for (let n = 0; n < t.length; n++) t[n].delete(e)
                t.length = 0
              }
            })(n)
            try {
              return f(), i.push(n), (u = n), e()
            } finally {
              i.pop(), l(), (u = i[i.length - 1])
            }
          }
        }
        return (
          (n.id = a++),
          (n.allowRecurse = !!t.allowRecurse),
          (n._isEffect = !0),
          (n.active = !0),
          (n.raw = e),
          (n.deps = []),
          (n.options = t),
          n
        )
      })(e, n)
      return n.lazy || r(), r
    }),
    (e.enableTracking = f),
    (e.isProxy = function(e) {
      return w(e) || y(e)
    }),
    (e.isReactive = w),
    (e.isReadonly = y),
    (e.markRaw = function(e) {
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
    }),
    (e.reactive = function(e) {
      return e && e.__v_isReadonly
        ? e
        : (function(e, t, n, c) {
            if (((i = e), null === i || 'object' != typeof i)) return e
            var i
            if (e.__v_raw && (!t || !e.__v_isReactive)) return e
            const u = t ? g : d,
              a = u.get(e)
            if (a) return a
            const o = ((s = e),
            s.__v_skip || !Object.isExtensible(s)
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
                })(r(s)))
            var s
            if (0 === o) return e
            const f = new Proxy(e, 2 === o ? c : n)
            return u.set(e, f), f
          })(e, !1, v, {})
    }),
    (e.resetTracking = l),
    (e.targetMap = c),
    (e.toRaw = function e(t) {
      return (t && e(t.__v_raw)) || t
    }),
    (e.track = _),
    (e.trigger = function(e, t, n, r, c, i) {}),
    Object.defineProperty(e, '__esModule', { value: !0 }),
    e
  )
})({})
