import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const rootAssetsDir = path.join(projectRoot, 'assets');

async function copyWorkboxFiles() {
  const distEntries = await readdir(distDir);
  const workboxFiles = distEntries.filter((name) => /^workbox-.*\.js$/i.test(name));
  for (const filename of workboxFiles) {
    await cp(path.join(distDir, filename), path.join(projectRoot, filename), { force: true });
  }
}

async function main() {
  await mkdir(rootAssetsDir, { recursive: true });
  await cp(path.join(distDir, 'sw.js'), path.join(projectRoot, 'sw.js'), { force: true });
  await copyWorkboxFiles();

  const assetsEntries = await readdir(distAssetsDir, { withFileTypes: true });
  for (const entry of assetsEntries) {
    const src = path.join(distAssetsDir, entry.name);
    const dest = path.join(rootAssetsDir, entry.name);
    await cp(src, dest, { force: true, recursive: entry.isDirectory() });
  }
}

main().catch((error) => {
  console.error('[postbuild-copy] Error:', error?.message ?? error);
  process.exit(1);
});
