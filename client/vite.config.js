import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react({
    // Enable fast refresh for better development experience
    fastRefresh: true,
  })],
  server: {
    port: 3000,
    host: true, // Allow external connections
    open: true, // Auto-open browser
    strictPort: true, // Fail if port is already in use
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable websocket proxying
      },
    },
    // Enable HMR (Hot Module Replacement)
    hmr: {
      overlay: true, // Show error overlay
    },
    // Watch options for better file change detection
    watch: {
      usePolling: false,
      interval: 100,
    },
  },
  build: {
    outDir: 'build',
    sourcemap: process.env.NODE_ENV === 'development',
    // Optimize bundle splitting
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  // Enable better error handling during development
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  },
})