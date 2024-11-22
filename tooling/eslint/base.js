import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
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
