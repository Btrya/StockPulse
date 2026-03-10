import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';

// 在最终 bundle 上跑字符串混淆（比 transform 阶段更可靠）
function obfuscateBundlePlugin() {
  return {
    name: 'obfuscate-bundle',
    apply: 'build',
    renderChunk(code, chunk) {
      // 只处理 app 入口 chunk，跳过 CSS 等
      if (!chunk.fileName.endsWith('.js')) return null;
      const result = JavaScriptObfuscator.obfuscate(code, {
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 1,      // 所有字符串走混淆
        splitStrings: false,
        // 关闭重量级选项
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        selfDefending: false,
        disableConsoleOutput: false,
        unicodeEscapeSequence: false,
        identifierNamesGenerator: 'hexadecimal',
      });
      return { code: result.getObfuscatedCode(), map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), obfuscateBundlePlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: false,
        passes: 1,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
});
