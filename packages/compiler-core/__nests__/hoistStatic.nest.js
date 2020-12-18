var { c } = require('./utils')

var c1 = (tpl, title) =>
  c(tpl, {
    title,
    options: { prefixIdentifiers: true, hoistStatic: true }
  })

c1(
  `<div><span>foo {{ 1 }} {{ true }}</span></div>`,
  'hoist nested static tree with static interpolation'
)
c1(`<div><span :foo="0">{{ 1 }}</span></div>`)
c1(`<div><span :class="{ foo: true }">{{ bar }}</span></div>`)
c1(`<div><p v-for="o in list"><span>{{ o }}</span></p></div>`)
