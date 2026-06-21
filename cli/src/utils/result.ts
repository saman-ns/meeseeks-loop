/**
 * Result type for functions that can fail expectedly.
 *
 * Use this pattern instead of throwing exceptions for expected failure cases
 * (file not found, config parsing errors, etc.) to make error handling explicit.
 *
 * @example
 * ```typescript
 * function loadConfig(): Result<Config, string> {
 *   try {
 *     const content = readFileSync(path, 'utf-8');
 *     return ok(JSON.parse(content));
 *   } catch (e) {
 *     return err(`Failed to load config: ${e}`);
 *   }
 * }
 *
 * const result = loadConfig();
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */

/**
 * Successful result containing a value
 */
export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

/**
 * Error result containing an error
 */
export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

/**
 * Result type - either Ok with a value or Err with an error
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Create a successful result
 */
export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Err<E> {
	return { ok: false, error };
}

/**
 * Check if result is ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
	return result.ok;
}

/**
 * Check if result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
	return !result.ok;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
	if (result.ok) {
		return result.value;
	}
	throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/**
 * Unwrap a result with a default value if it's an error
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
	return result.ok ? result.value : defaultValue;
}

/**
 * Map a successful result to a new value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Map an error result to a new error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
	return result.ok ? result : err(fn(result.error));
}

/**
 * Chain results together (flatMap)
 */
export function andThen<T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => Result<U, E>,
): Result<U, E> {
	return result.ok ? fn(result.value) : result;
}

/**
 * Try to execute a function and wrap the result
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
	try {
		return ok(fn());
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}

/**
 * Try to execute an async function and wrap the result
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
	try {
		return ok(await fn());
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}
