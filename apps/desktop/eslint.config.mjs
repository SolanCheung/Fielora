import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['.webpack/**', 'out/**'],
    languageOptions: {
      parserOptions: { project: './tsconfig.json' },
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    files: ['src/renderer/BrowseScreen.tsx'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[object.name='window'][property.name='fielora']",
        message: 'BrowseScreen must use only its narrowed browser capability prop.',
      }],
    },
  },
);
