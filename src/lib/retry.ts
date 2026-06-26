import { AppError, isPrismaConnectionError } from '@/lib/errors';

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in milliseconds before the first retry. Default: 200 */
  delayMs?: number;
  /** Multiplier applied to delayMs on each subsequent attempt. Default: 2 */
  backoff?: number;
}

/**
 * Execute `fn` with automatic retries on transient failures.
 *
 * Retries when:
 *  - The thrown error is a Prisma connection/timeout error (P1001, P1002, P1008, P1017)
 *  - The thrown error is an `AppError` with `retryable: true`
 *
 * Does NOT retry on:
 *  - `AppError` with `retryable: false` (e.g. FORBIDDEN, VALIDATION_ERROR, VERSION_CONFLICT)
 *  - Any other non-transient Error
 *
 * @throws The last encountered error after all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 200, backoff = 2 } = options;

  let lastError: unknown;
  let delay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const shouldRetry =
        isPrismaConnectionError(error) ||
        (error instanceof AppError && error.retryable);

      if (!shouldRetry || attempt === maxAttempts) {
        throw error;
      }

      // Log retry attempt for observability (server-side only)
      console.warn(
        `[withRetry] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms.`,
        error instanceof Error ? error.message : error
      );

      await sleep(delay);
      delay *= backoff;
    }
  }

  // Unreachable — the loop always throws or returns, but TypeScript needs this
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
