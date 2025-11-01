import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Allow both VITE_API_URL (standard Vite prefix) or API_URL fallback
  const apiTarget = env.VITE_API_URL || env.API_URL || 'http://localhost:4000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/auth': { target: apiTarget, changeOrigin: true, secure: false },
        '/me': { target: apiTarget, changeOrigin: true, secure: false },
        '/categories': { target: apiTarget, changeOrigin: true, secure: false },
        '/emails': { target: apiTarget, changeOrigin: true, secure: false },
        '/accounts': { target: apiTarget, changeOrigin: true, secure: false },
      },
    },
    define: {
      __API_URL__: JSON.stringify(apiTarget),
    },
  };
});
