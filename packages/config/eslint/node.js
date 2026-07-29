import globals from 'globals'
import tseslint from 'typescript-eslint'

import base from './base.js'

/** Server-side packages: libraries, workers, anything running in Node. */
export default tseslint.config(...base, {
  languageOptions: {
    globals: { ...globals.node },
  },
  rules: {
    'no-process-exit': 'error',
  },
})
