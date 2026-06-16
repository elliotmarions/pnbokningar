import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure unit tests for the lib/ helpers — no DOM needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
