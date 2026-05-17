import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  root: path.join(__dirname, 'renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, 'renderer-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, 'renderer/index.html'),
      output: {
        entryFileNames: 'widget.bundle.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
