import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/assets': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
      '/models3d': 'http://127.0.0.1:3000',
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
