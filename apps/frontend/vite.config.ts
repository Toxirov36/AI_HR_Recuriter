import path from 'path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Fonts the landing page needs immediately (hero heading, body text, buttons). Fontsource hashes the
// file names, so the preload tags are generated from the build output.
const CRITICAL_FONTS = /(inter-latin-(400|700)-normal|plus-jakarta-sans-latin-800-normal)-[\w-]+\.woff2$/;

function preloadCriticalFonts(): Plugin {
  return {
    name: 'preload-critical-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        return Object.keys(context.bundle ?? {})
          .filter((file) => CRITICAL_FONTS.test(file))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
            injectTo: 'head-prepend' as const,
          }));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadCriticalFonts()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
    headers: {
      'Referrer-Policy': 'no-referrer-when-downgrade',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          )
            return 'react-vendor';
          if (id.includes('/@radix-ui/')) return 'ui-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
