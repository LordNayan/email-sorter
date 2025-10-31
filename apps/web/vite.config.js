import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/me': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/categories': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/emails': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/accounts': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
