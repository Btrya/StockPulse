import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,   // 删除所有 console.*
        drop_debugger: false, // 保留 debugger（反调试用）
        passes: 1,
      },
      mangle: {
        toplevel: true,       // 混淆顶层变量名
      },
      format: {
        comments: false,      // 删除所有注释
      },
    },
    rollupOptions: {
      output: {
        // 打乱 chunk 命名，不暴露模块结构
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
});
