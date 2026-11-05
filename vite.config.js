import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the build works on GitHub Pages project
// sites (user.github.io/repo/), custom domains, and Vercel without changes.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
