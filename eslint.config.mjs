import js from '@eslint/js'
import react from 'eslint-plugin-react'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import oracles from '@tanstack/eslint-plugin-oracles'

export default [
  {
    ignores: [
      'dist/',
      'www/',
      'node_modules/',
      '.oracle-gaps/',
      '.oracle-package/',
    ],
  },
  js.configs.recommended,
  react.configs.flat.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      // Props are documented in JSDoc; React 19 ignores propTypes.
      'react/prop-types': 'off',
    },
  },
  prettier,
  // The React 16 and 17 render path: written for React 17's API.
  {
    files: ['test/oracle-react-legacy.js'],
    settings: { react: { version: '17.0' } },
  },
  // Oracle files (test/*oracle*) and the probe form in src/.
  oracles.configs.recommended,
  oracles.configs.production,
]
