/** An error class a Tool's logic throws for Input it cannot work with. */
type ExpectedError<E extends Error> = abstract new (...args: never[]) => E;

/** What an attempt produced: the value, or what stopped it. */
export type Attempt<T, E> = { value: T; error: null } | { value: null; error: E };

/**
 * Runs a Tool's logic and returns an expected error, one of the classes given, instead of throwing it, for a UI that
 * reads more than its reason (a position, a line). Any other error is a bug, not bad Input, and is rethrown.
 */
export function attemptError<T, E extends Error>(run: () => T, ...expected: ExpectedError<E>[]): Attempt<T, E> {
  try {
    return { value: run(), error: null };
  } catch (error) {
    if (expected.some((errorClass) => error instanceof errorClass)) return { value: null, error: error as E };
    throw error;
  }
}

/** Like `attemptError`, but returns only the expected error's reason, for the UI to translate. */
export function attempt<T, R>(run: () => T, ...expected: ExpectedError<Error & { readonly reason: R }>[]): Attempt<T, R> {
  const { value, error } = attemptError(run, ...expected);
  return error === null ? { value, error } : { value: null, error: error.reason };
}
