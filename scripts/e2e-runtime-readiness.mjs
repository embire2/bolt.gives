export async function waitForSettledRuntime(
  readStatus,
  { wait = () => new Promise((resolve) => setTimeout(resolve, 1000)), attempts = 60 } = {},
) {
  let stable = 0;
  let state;

  for (let attempt = 0; attempt < attempts; attempt++) {
    state = await readStatus();
    stable =
      state?.status === 'ready' && state.healthy && state.preview && state.recovery?.state === 'idle' ? stable + 1 : 0;

    if (stable === 2) {
      return state;
    }

    await wait();
  }
  throw new Error('Runtime commands did not settle into a verified healthy Preview before history navigation.');
}
