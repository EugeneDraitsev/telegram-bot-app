import typescriptParser from '@typescript-eslint/parser'

import typescriptPlugin from '@typescript-eslint/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import sonarjsPlugin from 'eslint-plugin-sonarjs'
import jestPlugin from 'eslint-plugin-jest'

export default [
  {
    // extends: [
    //   'plugin:sonarjs/recommended',
    //   'plugin:react/recommended',
    //   'plugin:react/jsx-runtime',
    //   'prettier',
    // ],
    files: ['**/*.js', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
    },
    plugins: {
      reactPlugin,
      typescriptPlugin,
      sonarjsPlugin,
      jestPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
]
