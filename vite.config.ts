/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { offline } from './offline/vite-offline';
import { version } from './package.json';

export default defineConfig({
  plugins: [offline('mcl-royale')],
  define: { __VERSION__: JSON.stringify(version) },
  // three.js en su propio archivo: el navegador lo guarda entre versiones del juego.
  build: { target: 'es2020', rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\/]three/ }] } } } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});