const e = Object.prototype.toString,
  t = t => (t => e.call(t))(t).slice(8, -1)
function n(e = !1, t = !1) {
  return function(e, n, r) {
    const c = Reflect.get(e, n, r)
    return t || console.log({ res: c }, 'get'), c
  }
}
const r = { get: n() },
  c = new WeakMap(),
  a = new WeakMap()
function o(e) {
  return e && e.__v_isReadonly
    ? e
    : (function(e, n, r, o) {
        if (((s = e), null === s || 'object' != typeof s)) return e
        var s
        if (e.__v_raw && (!n || !e.__v_isReactive)) return e
        const i = n ? a : c,
          u = i.get(e)
        if (u) return u
        const f = ((_ = e),
        _.__v_skip || !Object.isExtensible(_)
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
            })(t(_)))
        var _
        if (0 === f) return e
        const l = new Proxy(e, 2 === f ? o : r)
        return i.set(e, l), l
      })(e, !1, r, {})
}
export { o as reactive }
