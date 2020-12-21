const { c } = require('./utils')

c(`<div><p>{{ render }}</p></div>`, { title: 'should work' })
c(
  `
<template lang="pug">
body
  h1 Pug Examples
  div.container
    p Cool Pug example!
</template>
`,
  { title: 'preprocess pug' }
)
