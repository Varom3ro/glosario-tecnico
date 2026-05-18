import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/glosario-tecnico/',
  server: {
    port: 8123,
    strictPort: true,
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mobile: resolve(__dirname, 'mobile.html')
      }
    }
  }
});
