// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      // Honor the repo convention of prefixing intentionally-unused symbols
      // with an underscore (e.g. _event, _config, _targetSide).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
  {
    // Formly custom field types are registered by name and rendered
    // dynamically, so they are intentionally named *Type (not *Component) and
    // their selector is not an `app-` element.
    files: ['**/properties-panel/formly/*.type.ts'],
    rules: {
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/component-class-suffix': 'off',
    },
  },
  // Disable ESLint rules that conflict with Prettier. Must come last.
  eslintConfigPrettier,
);
