var { c, log } = require('./utils')

var res
var c1 = (tpl, title) =>
  c(tpl, {
    title,
    options: { scopeId: 'test', mode: 'module', hoistStatic: true }
  })

c1(`<div/>`, 'should wrap render function')
c1(`<Child><div/></Child>`, 'should wrap default slot')
c1(
  `<Child>
        <template #foo="{ msg }">{{ msg }}</template>
        <template #bar><div/></template>
      </Child>
      `,
  'should wrap named slots'
)
res = c1(
  `<Child>
        <template #foo v-if="ok"><div/></template>
        <template v-for="i in list" #[i]><div/></template>
      </Child>
      `,
  'should wrap dynamic slots'
)
log(res.ast.codegenNode.children.arguments[1].elements[1])
res = c1(`<div><div>hello</div>{{ foo }}<div>world</div></div>`)
