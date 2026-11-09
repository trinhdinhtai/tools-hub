import { useEffect, useState } from "react";

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** A promise that never rejects: its outcome, either way. Wrap it as you make it, so no rejection goes unhandled. */
export function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

/**
 * The outcome of the latest `promise`, or null while it runs (and when there is none). An older promise that settles
 * late is ignored, so a slow key import never shows over the result of what was typed after it.
 */
export function useSettled<T>(promise: Promise<Settled<T>> | null): Settled<T> | null {
  const [state, setState] = useState<{ promise: Promise<Settled<T>>; outcome: Settled<T> } | null>(null);
  useEffect(() => {
    if (!promise) return;
    let current = true;
    void promise.then((outcome) => current && setState({ promise, outcome }));
    return () => {
      current = false;
    };
  }, [promise]);
  return state && state.promise === promise ? state.outcome : null;
}
