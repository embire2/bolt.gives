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
    setStatus('Payment received. Verifying Custom Domain access and DNS...');
    void verifyHostedRuntimePremiumDomain(sessionId)
      .then((result) => {
        setStatus(
          result.ok
            ? `Custom Domain is active. Your project is live at ${result.url}.`
            : result.dnsInstructions?.note || result.message,
        );
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Custom Domain activation verification failed.');
      });
  }, [previewBaseUrl, setStatus]);
}
