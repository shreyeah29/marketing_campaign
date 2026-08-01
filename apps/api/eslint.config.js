// Minimal, deliberately lenient ESLint setup for @vsp/api.
//
// This package had no eslint config or dependency, so the `eslint src` lint step
// could never run — which is what kept CI's Lint stage red. This gets it running
// and green with a light touch: the TypeScript parser so files parse, and a small
// set of rules as *warnings* (not errors) so a codebase that has never been linted
// passes today. Tighten these to errors, and add more rules, over time.

import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.mjs', '**/*.cjs'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2023 },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
)
