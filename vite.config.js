import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': '/src',
    }
  },
  optimizeDeps: {
    include: ['matrix-js-sdk'],
    exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
  },
  server: {
    port: 5173
  }
})
