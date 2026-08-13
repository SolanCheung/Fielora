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
);
