import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertForwardZoneSerial,
  renderCpanelZone,
  verifySecondarySerial,
  writePublicZoneCandidate,
} from './cpanel-zone-file.mjs';

const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');
const record = (type: string, data: string[], owner = 'example.com.') => ({
  record_type: type,
  dname_b64: b64(owner),
  data_b64: data.map(b64),
  ttl: 300,
});
const zone = (records: ReturnType<typeof record>[]) => ({ serial: '2026091401', records });

describe('cPanel authoritative zone mirror', () => {
  it('keeps public zone files readable by named under a restrictive service umask', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-zone-permissions-'));
    const previous = process.umask(0o077);

    try {
      const filename = path.join(directory, 'zone.db');
      await writePublicZoneCandidate(filename, 'public-record');
      expect((await fs.stat(filename)).mode & 0o777).toBe(0o644);
      await expect(writePublicZoneCandidate(filename, 'replace')).rejects.toThrow();
      expect(await fs.readFile(filename, 'utf8')).toBe('public-record');
    } finally {
      process.umask(previous);
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it('waits for the served serial rather than trusting the reload command', async () => {
    const resolve = vi.fn().mockResolvedValueOnce({ serial: 1 }).mockResolvedValueOnce({ serial: 2 });
    await verifySecondarySerial('example.com', '2', resolve, async () => undefined);
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it('fails boundedly if a queued reload never replaces the served zone', async () => {
    const resolve = vi.fn().mockResolvedValue({ serial: 1 });
    await expect(verifySecondarySerial('example.com', '2', resolve, async () => undefined)).rejects.toThrow(
      'did not load',
    );
    expect(resolve).toHaveBeenCalledTimes(20);
  });
  it('preserves SOA, routing, mail, service and TXT records without interpreting their data as syntax', () => {
    const result = renderCpanelZone(
      zone([
        record('SOA', ['ns.example.net.', 'hostmaster.example.com.', '2026091401', '3600', '600', '86400', '300']),
        record('NS', ['ns.example.net.']),
        record('A', ['192.0.2.1']),
        record('AAAA', ['2001:db8::1']),
        record('CNAME', ['example.com.'], 'www.example.com.'),
        record('MX', ['10', 'mail.example.com.']),
        record('SRV', ['0', '0', '443', 'service.example.com.'], '_service._tcp.example.com.'),
        record('TXT', ['a"\\\n; $INCLUDE private', '\u00e1']),
        record('CAA', ['0', 'issue', 'letsencrypt.org']),
      ]),
      'example.com',
    );
    expect(result).toContain('IN MX 10 mail.example.com.');
    expect(result).toContain('IN SRV 0 0 443 service.example.com.');
    expect(result).toContain('"a\\034\\092\\010; $INCLUDE private" "\\225"');
    expect(result).not.toContain('\n; $INCLUDE');
  });
  it.each(['DNSKEY', 'DS', 'UNKNOWN'])('fails closed on unsupported %s instead of dropping records', (type) => {
    expect(() => renderCpanelZone(zone([record(type, ['value'])]), 'example.com')).toThrow('Unsupported');
  });
  it('rejects malformed addresses, names and numeric fields', () => {
    expect(() => renderCpanelZone(zone([record('A', ['not-an-ip'])]), 'example.com')).toThrow();
    expect(() => renderCpanelZone(zone([record('A', ['192.0.2.1'], 'x\n$INCLUDE secret')]), 'example.com')).toThrow();
    expect(() => renderCpanelZone(zone([record('MX', ['10\n', 'mail.example.com.'])]), 'example.com')).toThrow();
    expect(() => renderCpanelZone(zone([record('TXT', ['x'.repeat(256)])]), 'example.com')).toThrow('255');
  });
  it('allows forward serials including wraparound, but not stale or foreign content', () => {
    expect(() => assertForwardZoneSerial('; bolt-cpanel-sync serial=42\n', '43')).not.toThrow();
    expect(() => assertForwardZoneSerial('; bolt-cpanel-sync serial=4294967295\n', '0')).not.toThrow();
    expect(() => assertForwardZoneSerial('; bolt-cpanel-sync serial=42\n', '41')).toThrow('advance');
    expect(() => assertForwardZoneSerial('; bolt-cpanel-sync serial=42\n', '42')).toThrow('advance');
    expect(() => assertForwardZoneSerial('foreign zone', '43')).toThrow('not created');
  });
});
