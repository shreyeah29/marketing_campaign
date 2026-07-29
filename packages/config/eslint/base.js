import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

/**
 * Base configuration shared by every package.
 *
 * The architectural rules in `architectureBoundaries` are the mechanism that keeps the
 * modular monolith extractable. They are lint errors, not documentation, because a
 * dependency rule nobody enforces is a dependency rule that will be broken.
 */
export const architectureBoundaries = {
  name: 'vsp/architecture-boundaries',
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@vsp/providers', '@vsp/providers/*'],
            message:
              'ai-core defines ports; it must never import a provider adapter. Depend on the port interface and let DI supply the implementation.',
          },
          {
            group: ['../../../apps/*', '@vsp/web', '@vsp/api', '@vsp/worker'],
            message: 'A package must never import from an application. Dependencies point inward only.',
          },
          {
            group: ['openai', '@anthropic-ai/*', '@google/*', 'twilio', 'stripe', 'resend', '@aws-sdk/*'],
            message:
              'Vendor SDKs belong in packages/providers behind a port. Business logic must stay provider-agnostic.',
          },
          {
            group: ['**/prisma/client', '@prisma/client'],
            message:
              'Import the tenant-scoped client from @vsp/database instead. The raw Prisma client bypasses tenant isolation.',
          },
        ],
      },
    ],
  },
}

export default tseslint.config(
  { ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '**/*.generated.ts'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: { 'import-x': importX },
    rules: {
      // Correctness
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // An `any` that reaches a tenant boundary is a security bug, not a style issue.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Import hygiene
      'import-x/no-cycle': ['error', { maxDepth: 4 }],
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [{ pattern: '@vsp/**', group: 'internal', position: 'before' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // General
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
    },
  },

  architectureBoundaries,

  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'no-console': 'off',
    },
  },

  prettier,
)
