/** The host enforces this task-wide cap; tool guidance never resets it per call. */
export const RESOURCE_MAX_ATTEMPTS = 3;

/** Shared spending rule for every charging tool; full recovery rules live in the server instructions. */
export const PAID_TOOL_NOTE = `Charges the balance at the current server price; call it directly when the user's task needs it (a price inquiry is not a purchase request). If the outcome is unclear, reconcile records and billing before any retry. At most ${RESOURCE_MAX_ATTEMPTS} attempts per resource flow.`;

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
