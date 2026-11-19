// S-10: src/api/generated.ts must be exactly what openapi-typescript makes from backend/openapi.json.
// (tests/typeAgreement.check.ts checks, at compile time, that types.ts agrees with it.)
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// vitest runs from frontend/ (npm test); a file:// URL keeps the import working on Windows too.
const GENERATOR = pathToFileURL(resolve(process.cwd(), 'tools/typegen/generate.mjs'));

const lf = (text: string) => text.replace(/\r\n/g, '\n');

describe('generated API types', () => {
  it('generated.ts is up to date with backend/openapi.json', async () => {
    const generator = (await import(/* @vite-ignore */ GENERATOR.href)) as {
      render: () => Promise<string>;
      OUT_PATH: string;
    };
    const fresh = await generator.render();
    const committed = lf(await readFile(generator.OUT_PATH, 'utf8'));
    if (committed !== fresh) {
      throw new Error('src/api/generated.ts is stale. run: npm run types');
    }
    expect(committed).toBe(fresh);
  });

  it('generation is deterministic', async () => {
    const generator = (await import(/* @vite-ignore */ GENERATOR.href)) as { render: () => Promise<string> };
    expect(await generator.render()).toBe(await generator.render());
  });
});
