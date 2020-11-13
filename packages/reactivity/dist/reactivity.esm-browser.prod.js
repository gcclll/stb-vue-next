const e = {},
  t = Object.prototype.hasOwnProperty,
  n = Array.isArray,
  r = e => '[object Map]' === o(e),
  c = Object.prototype.toString,
  o = e => c.call(e),
  s = e =>
    'string' == typeof e &&
    'NaN' !== e &&
    '-' !== e[0] &&
    '' + parseInt(e, 10) === e,
  i = new WeakMap(),
  u = []
let a
const f = Symbol(''),
  l = Symbol('')
function p(t, n = e) {
  ;(function(e) {
    return e && !0 === e._isEffect
  })(t) && (t = t.raw)
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
          return h(), u.push(n), (a = n), e()
        } finally {
          u.pop(), v(), (a = u[u.length - 1])
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
  })(t, n)
  return n.lazy || r(), r
}
let _ = 0
let d = !0
const g = []
function h() {
  g.push(d), (d = !0)
}
function v() {
  const e = g.pop()
  d = void 0 === e || e
}
function w(e, t, n) {
  if (!d || void 0 === a) return
  let r = i.get(e)
  r || i.set(e, (r = new Map()))
  let c = r.get(n)
  c || r.set(n, (c = new Set())), c.has(a) || (c.add(a), a.deps.push(c))
}
function y(e, t, c, o, u, p) {
  const _ = i.get(e)
  if (!_) return
  const d = new Set(),
    g = e => {
      e &&
        e.forEach(e => {
          ;(e !== a || e.allowRecurse) && d.add(e)
        })
    }
  if ('clear' === t) _.forEach(g)
  else if ('length' === c && n(e))
    _.forEach((e, t) => {
      ;('length' === t || t >= o) && g(e)
    })
  else {
    void 0 !== c && g(_.get(c))
    const o = () => {
      g(_.get(f)), r(e) && g(_.get(l))
    }
    switch (t) {
      case 'add':
        n(e) ? s(c) && g(_.get('length')) : o()
        break
      case 'delete':
        n(e) || o()
        break
      case 'set':
        r(e) && g(_.get(f))
    }
  }
  d.forEach(e => {
    e.options.scheduler ? e.options.scheduler(e) : e()
  })
}
function b(e = !1, t = !1) {
  return function(t, n, r) {
    const c = Reflect.get(t, n, r)
    return e || w(t, 0, n), c
  }
}
function k(e = !1) {
  return function(e, r, c, o) {
    const i =
        n(e) && s(r) ? Number(r) < e.length : ((e, n) => t.call(e, n))(e, r),
      u = Reflect.set(e, r, c, o)
    return e === x(o) && y(e, i ? 'set' : 'add', r, c), u
  }
}
const R = { get: b(), set: k() },
  j = new WeakMap(),
  E = new WeakMap()
function M(e) {
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
      })((e => o(e).slice(8, -1))(e))
}
function S(e) {
  return e && e.__v_isReadonly
    ? e
    : (function(e, t, n, r) {
        if (((c = e), null === c || 'object' != typeof c)) return e
        var c
        if (e.__v_raw && (!t || !e.__v_isReactive)) return e
        const o = t ? E : j,
          s = o.get(e)
        if (s) return s
        const i = M(e)
        if (0 === i) return e
        const u = new Proxy(e, 2 === i ? r : n)
        return o.set(e, u), u
      })(e, !1, R, {})
}
function O(e) {
  return W(e) ? O(e.__v_raw) : !(!e || !e.__v_isReactive)
}
function W(e) {
  return !(!e || !e.__v_isReadonly)
}
function m(e) {
  return O(e) || W(e)
}
function x(e) {
  return (e && x(e.__v_raw)) || e
}
function A(e) {
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
  p as effect,
  h as enableTracking,
  m as isProxy,
  O as isReactive,
  W as isReadonly,
  A as markRaw,
  S as reactive,
  v as resetTracking,
  i as targetMap,
  x as toRaw,
  w as track,
  y as trigger
}
