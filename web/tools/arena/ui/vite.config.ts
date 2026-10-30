import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { resultsDir } from '../paths.ts';
import { arenaPlugin } from './server.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const webDir = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  root,
  plugins: [preact(), arenaPlugin(resultsDir(webDir))],
  server: { port: 5180 },
});
