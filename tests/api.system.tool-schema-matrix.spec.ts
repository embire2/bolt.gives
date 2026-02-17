import { describe, expect, it } from 'vitest';
import { loader } from '~/routes/api.system.tool-schema-matrix';

describe('api.system.tool-schema-matrix loader', () => {
  it('returns provider compatibility matrix and passing schema checks', async () => {
    const response = await loader();
    const payload = (await response.json()) as any;

    expect(Array.isArray(payload.matrix)).toBe(true);
    expect(Array.isArray(payload.results)).toBe(true);
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.every((result: any) => result.webSearchSchemaOk)).toBe(true);
    expect(payload.results.every((result: any) => result.webBrowseSchemaOk)).toBe(true);
  });
});
