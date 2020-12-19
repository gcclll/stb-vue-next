var { c, log, stringifyStatic } = require('./utils')

var res
var c1 = (tpl, title) =>
  c(tpl, {
    title,
    options: {
      hoistStatic: true,
      prefixIdentifiers: true,
      transformHoist: stringifyStatic
    }
  })

res = c1(
  `<div><div><div>hello</div><div>hello</div></div></div>`,
  'should bail on non-eligible static trees'
)
log(res.ast.hoists)
