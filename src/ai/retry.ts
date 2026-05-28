import { loadConfig } from "../state/config.js";
import { classifyAIProviderError } from "../errors/index.js";
import type { PSetupError } from "../errors/types.js";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, error: PSetupError, delayMs: number) => void;
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const config = await loadConfig();
  const maxRetries = options?.maxRetries ?? config.ai.maxRetries;
  const baseDelay = options?.baseDelayMs ?? config.ai.retryDelayMs;
  const timeoutMs = options?.timeoutMs ?? config.ai.timeoutMs;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

    try {
      const result = await fn(controller.signal);
      if (timer) clearTimeout(timer);
      return result;
    } catch (error) {
      if (timer) clearTimeout(timer);
      lastError = error;

      if (attempt >= maxRetries) break;

      const classified = classifyAIProviderError(error);
      if (!isRetryable(classified)) break;

      const delay = calculateBackoff(attempt, baseDelay);
      options?.onRetry?.(attempt + 1, classified, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(error: PSetupError): boolean {
  const retryableCodes = new Set([
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_UNAVAILABLE",
    "NETWORK_UNAVAILABLE",
  ]);
  return retryableCodes.has(error.code);
}

function calculateBackoff(attempt: number, baseDelay: number): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(exponential + jitter, 30000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RateBucket {
  tokens: number;
  lastRefill: number;
}

const providerBuckets = new Map<string, RateBucket>();

export async function acquireRateToken(provider: string): Promise<void> {
  const config = await loadConfig();
  const limit = config.ai.rateLimitPerMinute;
  if (limit <= 0) return;

  const now = Date.now();
  let bucket = providerBuckets.get(provider);

  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now };
    providerBuckets.set(provider, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / 60000) * limit;
  if (refill > 0) {
    bucket.tokens = Math.min(limit, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    const waitMs = 60000 - (now - bucket.lastRefill);
    await sleep(Math.max(waitMs, 1000));
    bucket.tokens = limit;
    bucket.lastRefill = Date.now();
  }

  bucket.tokens--;
}
