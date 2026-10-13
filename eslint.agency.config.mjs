import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';

export default [{
  files: [
    'tests/agency/**/*.ts',
    'libraries/helpers/src/testing/**/*.ts',
    'libraries/nestjs-libraries/src/integrations/social/synthetic.provider.ts',
    'apps/frontend/src/fonts/jakarta.ts',
    '*.agency.config.*',
    'scripts/agency/*.mjs',
  ],
  languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
  plugins: { '@typescript-eslint': plugin },
  rules: {
    'constructor-super': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'off',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'valid-typeof': 'error',
    eqeqeq: ['error', 'always'],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
}];
