import tseslint from 'typescript-eslint'

import node from './node.js'

/**
 * NestJS relaxes a few rules that fight the framework's idioms:
 * decorator metadata requires parameter properties, and DI classes legitimately
 * have empty constructors.
 */
export default tseslint.config(...node, {
  rules: {
    '@typescript-eslint/parameter-properties': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/no-useless-constructor': 'off',
    // Nest resolves injected types at runtime through emitted metadata.
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
    ],
  },
})
