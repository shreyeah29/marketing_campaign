import globals from 'globals'
import tseslint from 'typescript-eslint'

import base from './base.js'

/**
 * Frontend configuration. The Next.js plugin itself is added in apps/web so this
 * package does not need to depend on the framework.
 */
export default tseslint.config(...base, {
  languageOptions: {
    globals: { ...globals.browser, ...globals.node },
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
  rules: {
    // Server state belongs to TanStack Query. useEffect-based fetching was a
    // significant source of bugs in the previous implementation.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="useEffect"] CallExpression[callee.name="fetch"]',
        message:
          'Do not fetch in useEffect. Use TanStack Query (useQuery / useMutation) so caching, retries and invalidation are handled consistently.',
      },
      {
        selector: 'CallExpression[callee.name="alert"]',
        message: 'Use the toast system instead of window.alert().',
      },
    ],
  },
})
