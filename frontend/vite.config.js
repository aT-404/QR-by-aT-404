import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB to keep build logs clean
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Code-splitting large third-party dependencies into separate chunks
          if (id.includes('node_modules')) {
            if (id.includes('html5-qrcode')) {
              return 'html5-qrcode';
            }
            if (id.includes('jszip') || id.includes('file-saver')) {
              return 'jszip-exporter';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            return 'vendor'; // Generic vendor chunk for other packages (React, Router, etc.)
          }
        }
      }
    }
  }
})
