import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/defaults',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Strip .js extensions so ts-jest can resolve .ts source files
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        verbatimModuleSyntax: false,
      },
    }],
  },
  setupFilesAfterSetup: [],
  clearMocks: true,
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/middleware/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};

export default config;
