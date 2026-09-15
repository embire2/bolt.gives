/*
 * A root-owned oneshot service can validate and reload Caddy without granting a
 * non-root runtime access to TLS private keys or arbitrary privileged commands.
 */
export async function reloadProjectCaddy({ configPath, service = '' }, run) {
  if (service) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}\.service$/.test(service)) {
      throw new Error('Invalid Caddy reload service.');
    }

    await run('sudo', ['-n', '/usr/bin/systemctl', 'start', service]);

    return;
  }

  await run('caddy', ['validate', '--config', configPath]);
  await run('caddy', ['reload', '--config', configPath]);
}
