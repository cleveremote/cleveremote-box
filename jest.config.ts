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
        'src/modules/**/{use-cases,domain,infrastructure}/**/*.ts',
        '!src/modules/**/*.spec-mock.ts',
        // wiring NestJS pur (DI, pas de logique propre) : pas pertinent a unit-tester
        '!src/modules/**/*.module.ts'
    ],
    coverageReporters: ['text-summary', 'html', 'lcov', 'cobertura'],
    rootDir: '',
    testMatch: [
        '**/__tests__/**/*.+(ts|tsx|js)',
        '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    testPathIgnorePatterns: [
        '/node_modules/'
    ],
    coverageDirectory: './coverage',
    transform: {
        // isolatedModules : transpile fichier par fichier sans construire le graphe de types
        // complet du projet. Sur cette machine a 4 Go de RAM, le type-check croise complet fait
        // planter Node (heap JS epuise) des qu'un test importe un graphe large (ex: TriggerService
        // -> ScheduleService/ProcessService/execution.service.ts + mathjs). Contrepartie : les
        // erreurs de type inter-fichiers ne sont plus detectees par `jest`, seulement par `tsc`/l'IDE.
        '^.+\\.(ts|tsx)$': ['ts-jest', { isolatedModules: true }]
    },
    reporters: [ 'default', 'jest-junit' ],
    moduleNameMapper: {
        // certains fichiers importent depuis 'src/...' (chemin absolu resolu via `baseUrl` par
        // tsc/webpack, cf. sensor.service.ts) : ts-jest ne connait que les alias de `paths`, donc
        // on ajoute explicitement cette regle pour que Jest resolve aussi ce style d'import.
        '^src/(.*)$': '<rootDir>/src/$1',
        ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' })
    }
};
