import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [wasm()],
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
