import { distTraces } from './distTraces.ts';

const found = distTraces('dist');
if (found.length > 0) {
  console.error('The production build holds the emotion debug panel outside its own chunk:');
  for (const line of found) console.error(`  ${line}`);
  process.exit(1);
}
console.log('dist holds the emotion debug panel only in its own chunk');
