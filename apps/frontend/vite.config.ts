import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { defaultLocale, locales, type Locale } from './src/i18n/config';
import { applyLandingSeo } from './src/lib/landing-seo-html';

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

const LOCALES_DIR = path.resolve(__dirname, 'src/i18n/locales');

function readLanding(locale: Locale): Record<string, string> {
  const messages = JSON.parse(readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'));
  return messages.landing;
}

// Crawlers and link previews read the static HTML only. The root page carries the Uzbek head, and
// the build writes one page per other language (dist/ru/index.html, ...) from the same locale files.
function landingSeoPages(): Plugin {
  let outDir = 'dist';
  return {
    name: 'landing-seo-pages',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return applyLandingSeo(html, defaultLocale, readLanding(defaultLocale));
    },
    writeBundle() {
      const built = readFileSync(path.join(outDir, 'index.html'), 'utf8');
      for (const locale of locales.filter((code) => code !== defaultLocale)) {
        const dir = path.join(outDir, locale);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          path.join(dir, 'index.html'),
          applyLandingSeo(built, locale, readLanding(locale), { robots: true }),
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadCriticalFonts(), landingSeoPages()],
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
