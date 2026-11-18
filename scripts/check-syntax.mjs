import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(file) : /\.(?:mjs|js)$/.test(file) ? [file] : [];
  }));
  return nested.flat();
}
const groups = await Promise.all(['server', 'scripts', 'tests', 'public']
  .map(directory => collect(path.join(root, directory))));
const files = groups.flat();
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(result.stderr || `Unable to check ${path.relative(root, file)}`);
  }
}
console.log(`Syntax checked ${files.length} JavaScript files; ${failures} failures.`);
if (failures) process.exitCode = 1;
