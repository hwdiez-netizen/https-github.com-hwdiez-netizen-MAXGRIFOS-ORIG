import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const flagsPath = resolve(process.cwd(), 'public', 'maxgrifos-flags.js');

function getBuildId() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (vercelSha) return vercelSha.slice(0, 7);

  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const buildId = getBuildId();
const source = readFileSync(flagsPath, 'utf8');
const next = source.replace(/build_id:\s*'[^']*'/, `build_id: '${buildId}'`);

if (next !== source) {
  writeFileSync(flagsPath, next, 'utf8');
  console.log(`[set-build-id] build_id actualizado a ${buildId}`);
} else {
  console.log(`[set-build-id] build_id ya estaba en ${buildId}`);
}
