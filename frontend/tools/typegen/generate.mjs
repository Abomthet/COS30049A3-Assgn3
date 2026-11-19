// Generates src/api/generated.ts from ../backend/openapi.json (the API's authority).
// Run it with `npm run types` from frontend/. tests/generatedTypes.test.ts imports render() to catch a stale file.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

// Paths are relative to frontend/ (the working directory of `npm run types` and of `npm test`).
export const SPEC_PATH = resolve(process.cwd(), '../backend/openapi.json');
export const OUT_PATH = resolve(process.cwd(), 'src/api/generated.ts');

const HEADER = `/* eslint-disable */
// GENERATED FILE - do not edit by hand.
// Source: backend/openapi.json (openapi-typescript, pinned in tools/typegen).
// Regenerate with: cd frontend && npm run types
// tests/generatedTypes.test.ts fails when this file is stale.

`;

/** The text generated.ts must contain (LF line endings). */
export async function render() {
  const spec = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  const ast = await openapiTS(spec);
  return HEADER + astToString(ast).replace(/\r\n/g, '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeFile(OUT_PATH, await render());
  console.log('wrote src/api/generated.ts');
}
