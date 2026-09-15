export function observedPromptTokens(content, initialToken, followUpToken) {
  return {
    initialPromptObserved: content.includes(initialToken),
    followUpPromptObserved: Boolean(followUpToken && content.includes(followUpToken)),
  };
}

export function isIsolatedPreviewNavigationAbort(entry) {
  return /^REQFAIL GET https:\/\/pv-[a-f0-9]{32}\.[a-z0-9.-]+\/\S* :: net::ERR_ABORTED$/.test(entry);
}
