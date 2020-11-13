var VueReactivity = (function(e) {
  'use strict'
  const t = {},
    n = Object.prototype.hasOwnProperty,
    r = Array.isArray,
    c = e => '[object Map]' === i(e),
    o = Object.prototype.toString,
    i = e => o.call(e),
    a = e =>
      'string' == typeof e &&
      'NaN' !== e &&
      '-' !== e[0] &&
      '' + parseInt(e, 10) === e,
    s = new WeakMap(),
    u = []
  let f
  const l = Symbol(''),
    p = Symbol('')
  let _ = 0
  let d = !0
  const g = []
  function v() {
    g.push(d), (d = !0)
  }
  function h() {
    const e = g.pop()
    d = void 0 === e || e
  }
  function y(e, t, n) {
    if (!d || void 0 === f) return
    let r = s.get(e)
    r || s.set(e, (r = new Map()))
    let c = r.get(n)
    c || r.set(n, (c = new Set())), c.has(f) || (c.add(f), f.deps.push(c))
  }
  function w(e, t, n, o, i, u) {
    const _ = s.get(e)
    if (!_) return
    const d = new Set(),
      g = e => {
        e &&
          e.forEach(e => {
            ;(e !== f || e.allowRecurse) && d.add(e)
          })
      }
    if ('clear' === t) _.forEach(g)
    else if ('length' === n && r(e))
      _.forEach((e, t) => {
        ;('length' === t || t >= o) && g(e)
      })
    else {
      void 0 !== n && g(_.get(n))
      const o = () => {
        g(_.get(l)), c(e) && g(_.get(p))
      }
      switch (t) {
        case 'add':
          r(e) ? a(n) && g(_.get('length')) : o()
          break
        case 'delete':
          r(e) || o()
          break
        case 'set':
          c(e) && g(_.get(l))
      }
    }
    d.forEach(e => {
      e.options.scheduler ? e.options.scheduler(e) : e()
    })
  }
  function b(e = !1, t = !1) {
    return function(t, n, r) {
      const c = Reflect.get(t, n, r)
      return e || y(t, 0, n), c
    }
  }
  function R(e = !1) {
    return function(e, t, c, o) {
      const i =
          r(e) && a(t) ? Number(t) < e.length : ((e, t) => n.call(e, t))(e, t),
        s = Reflect.set(e, t, c, o)
      return e === m(o) && w(e, i ? 'set' : 'add', t, c), s
    }
  }
  const k = { get: b(), set: R() },
    M = new WeakMap(),
    j = new WeakMap()
  function E(e) {
    return e.__v_skip || !Object.isExtensible(e)
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
        })((e => i(e).slice(8, -1))(e))
  }
  function O(e) {
    return S(e) ? O(e.__v_raw) : !(!e || !e.__v_isReactive)
  }
  function S(e) {
    return !(!e || !e.__v_isReadonly)
  }
  function m(e) {
    return (e && m(e.__v_raw)) || e
  }
  return (
    (e.effect = function(e, n = t) {
      ;(function(e) {
        return e && !0 === e._isEffect
      })(e) && (e = e.raw)
      const r = (function(e, t) {
        const n = function() {
          if (!n.active) return t.scheduler ? void 0 : e()
          if (!u.includes(n)) {
            !(function(e) {
              const { deps: t } = e
              if (t.length) {
                for (let n = 0; n < t.length; n++) t[n].delete(e)
                t.length = 0
              }
            })(n)
            try {
              return v(), u.push(n), (f = n), e()
            } finally {
              u.pop(), h(), (f = u[u.length - 1])
            }
          }
        }
        return (
          (n.id = _++),
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
    (e.enableTracking = v),
    (e.isProxy = function(e) {
      return O(e) || S(e)
    }),
    (e.isReactive = O),
    (e.isReadonly = S),
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
        : (function(e, t, n, r) {
            if (((c = e), null === c || 'object' != typeof c)) return e
            var c
            if (e.__v_raw && (!t || !e.__v_isReactive)) return e
            const o = t ? j : M,
              i = o.get(e)
            if (i) return i
            const a = E(e)
            if (0 === a) return e
            const s = new Proxy(e, 2 === a ? r : n)
            return o.set(e, s), s
          })(e, !1, k, {})
    }),
    (e.resetTracking = h),
    (e.targetMap = s),
    (e.toRaw = m),
    (e.track = y),
    (e.trigger = w),
    Object.defineProperty(e, '__esModule', { value: !0 }),
    e
  )
})({})
