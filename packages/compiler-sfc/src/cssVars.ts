import { SFCDescriptor } from './parse'

export const CSS_VARS_HELPER = `useCssVars`
export const cssVarRE = /\bv-bind\(\s*(?:'([^']+)'|"([^"]+)"|([^'"][^)]*))\s*\)/g

export function parseCssVars(sfc: SFCDescriptor): string[] {
  const vars: string[] = []
  sfc.styles.forEach(style => {
    let match
    // v-bind('xxx'), v-bind("xxx"), v-bind()
    while ((match = cssVarRE.exec(style.content))) {
      vars.push(match[1] || match[2] || match[3])
    }
  })
  return vars
}
