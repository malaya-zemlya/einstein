import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

const browserPattern = 'test/**/*.browser.test.js'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/**/*.test.js'],
          exclude: [browserPattern, 'node_modules/**'],
        },
      },
      {
        test: {
          name: 'browser',
          include: [browserPattern],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                channel: 'chrome',
                args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
