import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

const testFiles = '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^#field-ui\/(.+)$/,
        replacement: fromRoot('packages/keystatic/src/form/fields/$1/ui.tsx'),
      },
    ],
  },
  oxc: { jsx: { runtime: 'automatic', development: false } },
  test: {
    reporters: ['verbose'],
    // Plus fork: a user-event dispatch can outlive its test and land in a torn-down
    // jsdom window (seen in the Switch and Combobox tests). The tests pass; only this
    // leftover rejection failed CI, so it alone is ignored.
    onUnhandledError(error) {
      if (
        error.message?.includes("parameter 1 is not of type 'Event'") &&
        error.stack?.includes('@testing-library/user-event')
      ) {
        console.warn(
          `Ignored known user-event teardown error: ${error.message}`
        );
        return false;
      }
    },
    fakeTimers: {
      shouldAdvanceTime: true,
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'Date',
        'performance',
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'keystar/ui',
          environment: 'jsdom',
          globals: true,
          clearMocks: true,
          setupFiles: ['./design-system/pkg/vitest-setup.ts'],
          include: [`design-system/${testFiles}`],
        },
      },
      {
        extends: true,
        test: {
          name: 'keystatic',
          environment: 'jsdom',
          globals: true,
          clearMocks: true,
          setupFiles: ['@testing-library/jest-dom/vitest'],
          include: [`packages/keystatic/${testFiles}`],
        },
      },
    ],
  },
});
