import { describe, expect, it, vi } from 'vitest';
import {
  cpanelPreviewDnsConfig,
  parseCpanelZone,
  readCpanelPreviewZone,
  updateCpanelPreviewChallenge,
} from './cpanel-preview-dns.mjs';

const env = {
  CPANEL_API_ORIGIN: 'https://cpanel.example.com:2083',
  CPANEL_API_USERNAME: 'fixture',
  CPANEL_API_TOKEN: 'fixture-token-not-a-production-secret',
  CPANEL_DNS_ZONE: 'example.com',
  CPANEL_PREVIEW_DOMAINS: 'preview.example.com,alpha-preview.example.com',
};
const config = cpanelPreviewDnsConfig(env);
const b64 = (value: string) => Buffer.from(value).toString('base64');
const record = (name: string, data: string[], type = 'TXT', line = 8) => ({
  dname_b64: b64(name),
  data_b64: data.map(b64),
  record_type: type,
  line_index: line,
});
const soa = (serial = '2026091401') =>
  record(
    'example.com.',
    ['ns.example.com.', 'hostmaster.example.com.', serial, '3600', '600', '86400', '300'],
    'SOA',
    0,
  );
const ok = (data: unknown) => new Response(JSON.stringify({ result: { status: 1, data } }));
const value = 'a'.repeat(43);
const input = { domain: 'preview.example.com', value };

describe('scoped cPanel Preview DNS challenge', () => {
  it('requires the owning username rather than guessing it from the token', () => {
    expect(() => cpanelPreviewDnsConfig({ ...env, CPANEL_API_USERNAME: '' })).toThrow('CPANEL_API_USERNAME');
  });
  it.each([
    'http://cpanel.example.com',
    'https://fixture:secret@cpanel.example.com',
    'https://cpanel.example.com/path',
  ])('refuses unsafe API origin %s', (origin) => {
    expect(() => cpanelPreviewDnsConfig({ ...env, CPANEL_API_ORIGIN: origin })).toThrow('HTTPS origin');
  });
  it('requires explicit namespaces inside the owned zone', () => {
    expect(() => cpanelPreviewDnsConfig({ ...env, CPANEL_PREVIEW_DOMAINS: 'example.com.evil.test' })).toThrow('inside');
    expect(() => cpanelPreviewDnsConfig({ ...env, CPANEL_PREVIEW_DOMAINS: '' })).toThrow('explicitly');
  });
  it('rejects a mismatching or absent SOA instead of editing an unknown zone', () => {
    expect(() => parseCpanelZone([soa()], 'another.example.com')).toThrow('valid SOA');
  });
  it('adds only the allowlisted ACME TXT and keeps the token out of the URL', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([soa(), record('example.com.', ['192.0.2.1'], 'A')]))
      .mockResolvedValueOnce(ok({}));
    const beforeChange = vi.fn();
    await expect(updateCpanelPreviewChallenge(config, input, { fetchImpl, beforeChange })).resolves.toEqual({
      changed: true,
      name: '_acme-challenge.preview.example.com.',
    });

    const [url, options] = fetchImpl.mock.calls[1];
    expect(url.searchParams.get('serial')).toBe('2026091401');
    expect(JSON.parse(url.searchParams.get('add'))).toEqual({
      dname: '_acme-challenge.preview.example.com.',
      ttl: 60,
      record_type: 'TXT',
      data: [value],
    });
    expect(url.searchParams.has('edit')).toBe(false);
    expect(url.searchParams.has('remove')).toBe(false);
    expect(String(url)).not.toContain(config.token);
    expect(options.redirect).toBe('error');
    expect(options.headers.Authorization).toBe(`cpanel ${config.username}:${config.token}`);
    expect(beforeChange).toHaveBeenCalledOnce();
  });
  it('does not duplicate an already-applied challenge', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([soa(), record('_acme-challenge.preview.example.com.', [value])]));
    expect((await updateCpanelPreviewChallenge(config, input, { fetchImpl })).changed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('preserves binary TXT bytes that are not the exact ACME value', async () => {
    const binary = record('_acme-challenge.preview.example.com.', [value]);
    binary.data_b64 = [Buffer.alloc(43, 0xe1).toString('base64')];

    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([soa(), binary])).mockResolvedValueOnce(ok({}));

    expect((await updateCpanelPreviewChallenge(config, { ...input, remove: true }, { fetchImpl })).changed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('removes only this challenge, preserving other simultaneous TXT values and hostnames', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        ok([
          soa(),
          record('_acme-challenge.preview.example.com.', ['b'.repeat(43)], 'TXT', 7),
          record('_acme-challenge.preview.example.com.', [value], 'TXT', 8),
          record('_acme-challenge.other.example.com.', [value], 'TXT', 9),
        ]),
      )
      .mockResolvedValueOnce(ok({}));
    await updateCpanelPreviewChallenge(config, { ...input, remove: true }, { fetchImpl });
    expect([...fetchImpl.mock.calls[1][0].searchParams.entries()].filter(([key]) => key.startsWith('remove'))).toEqual([
      ['remove-0', '8'],
    ]);
  });
  it('refuses delegated challenges instead of replacing the CNAME', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok([soa(), record('_acme-challenge.preview.example.com.', ['validation.example.net.'], 'CNAME')]),
      );
    await expect(updateCpanelPreviewChallenge(config, input, { fetchImpl })).rejects.toThrow('delegated');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('re-reads the serial after a concurrent zone edit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([soa()]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { status: 0, errors: ['serial mismatch'] } })))
      .mockResolvedValueOnce(ok([soa('2026091402')]))
      .mockResolvedValueOnce(ok({}));
    await updateCpanelPreviewChallenge(config, input, { fetchImpl });
    expect(fetchImpl.mock.calls[3][0].searchParams.get('serial')).toBe('2026091402');
  });
  it('bounds repeated serial conflicts', async () => {
    const fetchImpl = vi.fn(async (input: unknown) =>
      new URL(String(input)).pathname.endsWith('parse_zone')
        ? ok([soa()])
        : new Response(JSON.stringify({ result: { status: 0, errors: ['serial mismatch'] } })),
    );
    await expect(updateCpanelPreviewChallenge(config, input, { fetchImpl })).rejects.toThrow('zone changed');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it('never sends requests for an unapproved domain or malformed validation value', async () => {
    const fetchImpl = vi.fn();
    await expect(
      updateCpanelPreviewChallenge(config, { ...input, domain: 'admin.example.com' }, { fetchImpl }),
    ).rejects.toThrow('allowed Preview');
    await expect(updateCpanelPreviewChallenge(config, { ...input, value: 'x\nunsafe' }, { fetchImpl })).rejects.toThrow(
      'validation value',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not expose provider errors or credentials', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(`Connection failed ${config.token}`));
    await expect(readCpanelPreviewZone(config, { fetchImpl })).rejects.toThrow('request failed');
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({ result: { status: 0, errors: [config.token] } })));
    await expect(readCpanelPreviewZone(config, { fetchImpl })).rejects.toThrow('API permissions');
  });
});
