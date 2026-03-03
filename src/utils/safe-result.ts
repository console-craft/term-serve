/**
 * Represents a result tuple that either contains a value of type T or an error.
 * Used for type-safe error handling where the first element indicates an error state.
 *
 * @template T The type of the successful value
 */
export type Result<T> = readonly [null, T] | readonly [Error, null]

/**
 * Converts an unknown error into a standardized Error object.
 *
 * If the input is already an Error, it returns it directly.
 * If the input can be stringified, it creates an Error with the stringified content.
 * Otherwise, it creates an Error with the string representation of the input.
 *
 * @param {unknown} err The error to convert
 * @returns {Error} A standardized Error object
 */
export function asError(err: unknown): Error {
  if (err instanceof Error) return err

  try {
    return new Error(JSON.stringify(err))
  } catch {
    return new Error(String(err))
  }
}

/**
 * Executes a function and captures any thrown errors, returning a Result tuple.
 *
 * @template T The type of the successful value
 * @param {() => T} fn The function to execute
 * @returns {Result<T>} A tuple containing either an error or the successful value
 */
export function asResult<T>(fn: () => T): Result<T> {
  try {
    return [null, fn()]
  } catch (err) {
    return [asError(err), null]
  }
}

/**
 * Executes an async function and captures rejected errors, returning a Result tuple.
 *
 * @template T The type of the successful value
 * @param {() => Promise<T>} fn The async function to execute
 * @returns {Promise<Result<T>>} A promise resolving to either an error or the successful value
 */
export async function asAsyncResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return [null, await fn()]
  } catch (err) {
    return [asError(err), null]
  }
}
