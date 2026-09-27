'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/**', 'src/**', 'tests/android/**', 'tests/ios/**', 'tests/tests.js', 'types/**', 'doc/**']
    },
    js.configs.recommended,
    {
        rules: {
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
        }
    },
    {
        files: ['www/**/*.js'],
        languageOptions: {
            ecmaVersion: 2017,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                cordova: 'readonly',
                BigInt: 'readonly',
                module: 'writable',
                require: 'readonly'
            }
        }
    },
    {
        files: ['tests/unit/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node
        }
    }
];
