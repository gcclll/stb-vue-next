const { decodeHtml, log } = require('./utils')

let res = decodeHtml(`&#x20ac, 0x0192`)
log(res)
