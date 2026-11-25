import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {ignores: ['node_modules', 'dist', 'results']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {globals: globals.node},
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', {fixStyle: 'inline-type-imports'}]
    }
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {globals: globals.browser}
  }
)
