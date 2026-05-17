import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup.html'),
        sidepanel: path.resolve(__dirname, 'sidepanel.html'),
        background: path.resolve(__dirname, 'src/background.ts'),
        content: path.resolve(__dirname, 'src/content.ts'),
        utils: path.resolve(__dirname, 'src/utils.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => (
          ['background', 'content', 'utils'].includes(chunkInfo.name)
            ? '[name].js'
            : 'assets/[name].js'
        ),
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
