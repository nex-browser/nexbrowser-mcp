/** The host enforces this task-wide cap; tool guidance never resets it per call. */
export const RESOURCE_MAX_ATTEMPTS = 3;

export function resourceRecovery(
  resourceType: 'sms' | 'mail' | 'proxy' | 'captcha',
  action: 'REPLACE_RESOURCE' | 'RETRY_CHALLENGE' | 'RECONCILE' | 'STOP' | 'COMPLETE',
  reason: string,
  resourceId?: string | number
) {
  return {
    resourceType,
    action,
    reason,
    ...(resourceId === undefined ? {} : { resourceId }),
    retryable: action === 'REPLACE_RESOURCE' || action === 'RETRY_CHALLENGE',
    maxAttempts: RESOURCE_MAX_ATTEMPTS,
    requiresNewChallenge: action === 'RETRY_CHALLENGE'
  };
}

/** Abort without waiting for the next polling request. */
export function servicePollDelay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const aborted = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', aborted, { once: true });
  });
}
