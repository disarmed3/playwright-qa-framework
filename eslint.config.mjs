// ESLint flat config (Week 2 Task 08).
// Prettier owns formatting: eslint-config-prettier comes last and switches off every formatting
// rule, so ESLint reports only code problems.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

// Globals for our plain Node scripts (.mjs), listed here because they are not TypeScript.
const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
};

export default defineConfig(
  {
    // The same exclusions as .prettierignore; flat config does not read .gitignore.
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.playwright-mcp/**',
      // The supplied Jira seed pack stays as delivered.
      'jira-seed/**',
      'scripts/jira-seed.mjs',
      'vault/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Our own Node scripts, hook scripts and node:test files are linted explicitly.
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: nodeGlobals },
  },
  {
    // Logging is noise in tests and Page Objects; scripts keep console.
    files: ['tests/**/*.ts', 'pages/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // Spec files only. env/runIfEnv.ts and safety/probes call test.skip on purpose and are outside
    // this block, so the environment helper keeps its intended skip.
    files: ['tests/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
    },
  },
  prettier,
);
