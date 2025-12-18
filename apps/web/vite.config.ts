import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:4100',
        changeOrigin: true,
      },
    },
  },
});
