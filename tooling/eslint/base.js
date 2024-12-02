import { defineConfig } from '@shahrad/eslint-config';

export default defineConfig(
  {
    ignores: ['dist/**'],
  },
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/semi': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': ['off', { allowShortCircuit: true }],
      '@typescript-eslint/no-unused-vars': [
        'off',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
