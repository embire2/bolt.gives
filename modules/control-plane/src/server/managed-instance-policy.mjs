import { readMergedRuntimeEnv, updateRuntimeEnvFile } from './runtime-env-file.mjs';

export function readManagedInstancePolicy(env = process.env) {
  return { singleInstancePerUser: readMergedRuntimeEnv(env).BOLT_MANAGED_INSTANCE_ONE_PER_USER !== 'false' };
}

export async function updateManagedInstancePolicy(singleInstancePerUser, env = process.env) {
  if (typeof singleInstancePerUser !== 'boolean') {
    throw new Error('The one-instance-per-user setting must be a boolean.');
  }

  await updateRuntimeEnvFile({ BOLT_MANAGED_INSTANCE_ONE_PER_USER: String(singleInstancePerUser) }, env);

  return readManagedInstancePolicy(env);
}
