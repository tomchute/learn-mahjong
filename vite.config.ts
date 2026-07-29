import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built app works from any static host path (incl. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
