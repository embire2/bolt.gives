import { describe, expect, it, vi } from 'vitest';
import { reloadProjectCaddy } from './project-caddy-reload.mjs';

describe('privilege-limited Caddy reload', () => {
  it('uses only the configured noninteractive oneshot service', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await reloadProjectCaddy({ configPath: '/etc/caddy/Caddyfile', service: 'bolt-gives-caddy-reload.service' }, run);
    expect(run.mock.calls).toEqual([
      ['sudo', ['-n', '/usr/bin/systemctl', 'start', 'bolt-gives-caddy-reload.service']],
    ]);
  });

  it.each(['x.service; id', '--help', '../x.service', 'x\ny.service'])('refuses unsafe service %s', async (service) => {
    const run = vi.fn();
    await expect(reloadProjectCaddy({ configPath: '/etc/caddy/Caddyfile', service }, run)).rejects.toThrow(
      'Invalid Caddy',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('propagates service failure instead of reporting a successful reload', async () => {
    const run = vi.fn().mockRejectedValue(new Error('service failed'));
    await expect(
      reloadProjectCaddy({ configPath: '/etc/caddy/Caddyfile', service: 'bolt-gives-caddy-reload.service' }, run),
    ).rejects.toThrow('service failed');
  });

  it('validates direct reloads and does not reload an invalid configuration', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('invalid configuration'));
    await expect(reloadProjectCaddy({ configPath: '/etc/caddy/Caddyfile' }, run)).rejects.toThrow(
      'invalid configuration',
    );
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('caddy', ['validate', '--config', '/etc/caddy/Caddyfile']);
  });
});
