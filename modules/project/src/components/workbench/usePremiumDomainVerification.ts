import { useEffect, useRef } from 'react';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';
import {
  extractHostedRuntimeSessionIdFromPreviewBaseUrl,
  verifyHostedRuntimePremiumDomain,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';

export function usePremiumDomainVerification(previewBaseUrl: string | undefined, setStatus: (status: string) => void) {
  const attemptedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);

    if (search.get('premium') !== 'success') {
      return;
    }

    const sessionId =
      extractHostedRuntimeSessionIdFromPreviewBaseUrl(previewBaseUrl) || workbenchStore.hostedRuntimeSessionId;

    if (!sessionId || attemptedSessionRef.current === sessionId) {
      return;
    }

    attemptedSessionRef.current = sessionId;
    setStatus('Payment received. Verifying WebCoder Premium and custom-domain DNS...');
    void verifyHostedRuntimePremiumDomain(sessionId)
      .then((result) => {
        setStatus(
          result.ok
            ? `WebCoder Premium is active. Your custom domain is live at ${result.url}.`
            : result.dnsInstructions?.note || result.message,
        );
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Premium activation verification failed.');
      });
  }, [previewBaseUrl, setStatus]);
}
