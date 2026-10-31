import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { resultsDir } from '../paths.ts';
import { arenaPlugin } from './server.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const webDir = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  base: command === 'build' ? `${process.env.BASE_PATH ?? '/'}arena/` : '/',
  publicDir: command === 'build' ? `${webDir}arena-results` : false,
  plugins: [preact(), arenaPlugin(resultsDir(webDir))],
  build: { outDir: `${webDir}dist/arena`, emptyOutDir: true },
}));
