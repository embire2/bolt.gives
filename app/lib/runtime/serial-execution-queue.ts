export function createResilientExecutionQueue(onError?: (error: unknown) => void) {
  let chain = Promise.resolve();

  return (callback: () => Promise<void>) => {
    chain = chain.then(callback).catch((error) => {
      onError?.(error);
    });

    return chain;
  };
}
