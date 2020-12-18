var { c, log } = require('./utils')

var res
var c1 = (tpl, title) =>
  c(tpl, {
    title,
    options: {
      prefixIdentifiers: true
    }
  })

res = c(
  '<Comp v-model:foo.trim="foo" v-model:bar.number="bar" />',
  'should generate modelModifiers for component v-model with arguments'
)

log(res.ast.codegenNode)
