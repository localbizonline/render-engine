#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { patchHyperframesCliSource } from './patch-hyperframes-cli-lib.mjs';

const cliPath = path.resolve(process.cwd(), 'node_modules/hyperframes/dist/cli.js');

if (!fs.existsSync(cliPath)) {
  console.error(`[patch-hyperframes-cli] Missing file: ${cliPath}`);
  process.exit(1);
}

const original = fs.readFileSync(cliPath, 'utf8');
let patched = original;

try {
  patched = patchHyperframesCliSource(patched);
} catch (error) {
  console.error(`[patch-hyperframes-cli] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

fs.writeFileSync(cliPath, patched, 'utf8');
console.log(`[patch-hyperframes-cli] Patched ${cliPath}`);
