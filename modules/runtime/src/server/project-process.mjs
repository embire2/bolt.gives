import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SAFE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function projectProcessConfig(env = process.env) {
  const mode = env.BOLT_PROJECT_EXECUTION_MODE || 'local';

  if (!['local', 'podman'].includes(mode)) {
    throw new Error('Unsupported project execution mode.');
  }

  const uid = Number(env.BOLT_PROJECT_RUNNER_UID);
  const gid = Number(env.BOLT_PROJECT_RUNNER_GID);
  const home = env.BOLT_PROJECT_RUNNER_HOME;
  const image = env.BOLT_PROJECT_CONTAINER_IMAGE;

  if (mode === 'podman') {
    if (![uid, gid].every((id) => Number.isSafeInteger(id) && id > 0)) {
      throw new Error('Rootless project execution requires a non-root runner UID and GID.');
    }

    if (!home || !path.isAbsolute(home) || !image || !/^sha256:[a-f0-9]{64}$/.test(image)) {
      throw new Error('Rootless project execution requires a runner home and a pinned local image ID.');
    }
  }

  return { mode, uid, gid, home, image };
}

export function projectProcessInvocation(command, args, options, config, hostUid = process.getuid?.()) {
  if (config.mode !== 'podman') {
    if (hostUid === 0) {
      throw new Error('Project execution as root is disabled. Configure the rootless project runner.');
    }

    return { command, args, options };
  }

  const cwd = path.resolve(options.cwd);

  if (cwd === '/' || /[,:\r\n]/.test(cwd)) {
    throw new Error('Invalid project mount path.');
  }

  if (hostUid !== 0 && hostUid !== config.uid) {
    throw new Error('The runtime cannot assume the configured rootless runner identity.');
  }

  const name = `bolt-project-${crypto.randomUUID()}`;
  const environment = {
    ...options.env,
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: cwd,
    USER: 'bolt-project',
    LOGNAME: 'bolt-project',
  };
  const podmanArgs = [
    'run',
    '--rm',
    '--init',
    '--stop-timeout=5',
    '--pull=never',
    '--name',
    name,
    '--userns=keep-id',
    '--user',
    `${config.uid}:${config.gid}`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--read-only',
    '--pids-limit=256',
    '--memory=1536m',
    '--cpus=1',
    '--network=slirp4netns:allow_host_loopback=false',
    '--dns=1.1.1.1',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=256m',
    '--volume',
    `${cwd}:${cwd}:rw`,
    '--workdir',
    cwd,
    '--env',
    `HOME=${cwd}`,
    '--env',
    'PATH=/usr/local/bin:/usr/bin:/bin',
    '--env',
    'USER=bolt-project',
    '--env',
    'LOGNAME=bolt-project',
  ];
  const port = Number(options.previewPort);

  if (options.previewPort !== undefined) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error('Invalid isolated Preview port.');
    }

    podmanArgs.push('--publish', `127.0.0.1:${port}:${port}`);
  }

  // Values travel through the child environment, not process arguments or an env file in source.
  for (const [key, value] of Object.entries(environment)) {
    if (
      !['HOME', 'PATH', 'USER', 'LOGNAME', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'].includes(key) &&
      SAFE_ENV_NAME.test(key) &&
      typeof value === 'string'
    ) {
      podmanArgs.push('--env', key);
    }
  }

  podmanArgs.push(config.image, command, ...args);

  return {
    command: '/usr/bin/podman',
    args: podmanArgs,
    name,
    options: {
      cwd: config.home,
      uid: config.uid,
      gid: config.gid,
      detached: options.detached,
      env: {
        ...environment,
        USER: undefined,
        LOGNAME: undefined,
        HOME: config.home,
        PATH: '/usr/bin:/bin',
        XDG_RUNTIME_DIR: `/run/user/${config.uid}`,
        DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${config.uid}/bus`,
      },
    },
  };
}

export async function prepareProjectProcessDirectory(directory, config = projectProcessConfig()) {
  if (config.mode !== 'podman') {
    return;
  }

  const root = path.resolve(directory);
  const stat = await fs.lstat(root);

  if (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.realpath(root)) !== root) {
    throw new Error('Project mount must be a real directory without symlink ancestors.');
  }

  // Ownership migration is explicit and separate. Never recursively chown customer source here.
  if (stat.uid !== config.uid || stat.gid !== config.gid) {
    throw new Error('Project storage has not been migrated to the rootless runner. Source was not modified.');
  }
}

export function spawnProjectProcess(command, args, options, config = projectProcessConfig()) {
  if (config.mode === 'podman' && command === 'bash') {
    // A login shell would replace the container's explicit HOME/PATH with /etc/profile defaults.
    args = args.map((arg, index) => (index === 0 && arg === '-lc' ? '-c' : arg));

    if (options.previewPort !== undefined) {
      args = args.map((arg, index) =>
        index === 1
          ? arg.replace(/(--host(?:=|\s+)|-H\s+)(?:127\.0\.0\.1|localhost)\b/g, (_, flag) => `${flag}0.0.0.0`)
          : arg,
      );
      options = { ...options, env: { ...options.env, HOST: '0.0.0.0' } };
    }
  }

  const invocation = projectProcessInvocation(command, args, options, config);
  const child = spawn(invocation.command, invocation.args, invocation.options);

  if (invocation.name) {
    let stopping;
    child.terminateProject = () =>
      (stopping ||= new Promise((resolve) => {
        const stop = spawn('/usr/bin/podman', ['rm', '--force', '--ignore', invocation.name], {
          ...invocation.options,
          detached: false,
          stdio: 'ignore',
        });
        const finish = (stopped) => {
          clearTimeout(deadline);
          resolve({ stopped });
        };
        const deadline = setTimeout(() => {
          stop.kill('SIGKILL');
          finish(false);
        }, 15_000);
        stop.once('error', () => finish(false));
        stop.once('close', (code) => finish(code === 0));
      }));

    // SIGKILL/timeout must not leave a detached container serving an abandoned Preview.
    child.once('close', () => {
      const cleanup = spawn('/usr/bin/podman', ['rm', '--force', '--ignore', invocation.name], {
        ...invocation.options,
        detached: false,
        env: {
          PATH: '/usr/bin:/bin',
          HOME: config.home,
          XDG_RUNTIME_DIR: `/run/user/${config.uid}`,
          DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${config.uid}/bus`,
        },
        stdio: 'ignore',
      });
      cleanup.on('error', () => undefined);
    });
  }

  return child;
}
