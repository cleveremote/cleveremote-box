/* eslint-disable @typescript-eslint/no-var-requires */
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    verbose: true,
    collectCoverage: true,
    moduleFileExtensions: [
        'js',
        'json',
        'ts'
    ],
    collectCoverageFrom: [
        'src/common/**/*.ts',
        'src/modules/**/{use-cases,domain}/**/*.ts',
        '!src/modules/**/*.spec-mock.ts'
    ],
    coverageReporters: ['text-summary', 'html', 'lcov', 'cobertura'],
    rootDir: '',
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    coverageDirectory: './coverage',
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
    },
    reporters: [ 'default', 'jest-junit' ],
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' })
};
