import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Base JavaScript recommended rules
  js.configs.recommended,
  
  // TypeScript recommended rules
  ...tseslint.configs.recommended,
  
  // Custom configuration for TypeScript files
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Allow 'any' type with warning (needed for Prisma where clauses)
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // Allow unused vars if prefixed with underscore
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      
      // Enforce consistent type imports
      '@typescript-eslint/consistent-type-imports': 'error',
      
      // Allow empty functions (useful for base classes)
      '@typescript-eslint/no-empty-function': 'off',
      
      // Console statements allowed in Node.js
      'no-console': 'off',
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'prisma/**',
      '*.js',
      '*.cjs',
      '*.mjs',
    ],
  },
];
