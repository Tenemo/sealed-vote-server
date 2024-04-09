import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.[tj]s$': [
            'ts-jest',
            {
                isolatedModules: true,
            },
        ],
    },
    moduleNameMapper: {
        'routes/(.*)': '<rootDir>/src/routes/$1',
    },
    moduleDirectories: ['node_modules', 'src'],
    moduleFileExtensions: ['js', 'ts'],
    extensionsToTreatAsEsm: ['.ts'],
};
export default jestConfig;
