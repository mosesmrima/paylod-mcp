/** Error thrown when a paylod edge function returns a non-2xx response. */
export class PaylodApiError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  readonly body?: unknown;

  constructor(message: string, status: number, opts?: { retryAfter?: number; body?: unknown }) {
    super(message);
    this.name = "PaylodApiError";
    this.status = status;
    if (opts?.retryAfter !== undefined) this.retryAfter = opts.retryAfter;
    if (opts?.body !== undefined) this.body = opts.body;
  }
}

/** Error thrown when the client cannot reach the network (timeout, DNS, etc.). */
export class PaylodNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaylodNetworkError";
  }
}

/** Normalize any thrown value into a short, agent-readable message. */
export function toMessage(err: unknown): string {
  if (err instanceof PaylodApiError) {
    const parts = [`paylod API error ${err.status}: ${err.message}`];
    if (err.retryAfter !== undefined) parts.push(`(retry after ${err.retryAfter}s)`);
    return parts.join(" ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
