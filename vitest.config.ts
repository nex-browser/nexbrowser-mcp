import { defineConfig } from 'vitest/config';

/**
 * Restricts discovery to the test/ directory's .test.ts files so vitest never runs the compiled copies under lib/ or dist/.
 * 将测试发现限定在 test/ 目录的 .test.ts 文件，避免 vitest 误跑 lib/ 或 dist/ 下的编译产物。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/lib/**', '**/dist/**']
  }
});
