import { asAsyncResult, asResult, type Result } from "@/utils/safe-result"
import { fetchServerConfig } from "./config"
import { getSessionStorage } from "./utils"

const AUTH_TOKEN_STORAGE_KEY = "term-serve.authToken"
let inMemoryAuthToken: string | undefined

/**
 * Retrieves the stored auth token from memory or session storage.
 *
 * @return {string | undefined} The stored auth token, or `undefined` if not found.
 */
function getStoredAuthToken(): string | undefined {
  if (inMemoryAuthToken) {
    return inMemoryAuthToken
  }

  const storage = getSessionStorage()

  if (!storage) {
    return undefined
  }

  const [error, token] = asResult(() => storage.getItem(AUTH_TOKEN_STORAGE_KEY))
  if (error) {
    return undefined
  }

  return token ?? undefined
}

/**
 * Stores the auth token in memory and session storage.
 *
 * @param {string} token - The auth token to store.
 */
function storeAuthToken(token: string): void {
  inMemoryAuthToken = token

  const storage = getSessionStorage()
  if (!storage) {
    return
  }

  asResult(() => storage.setItem(AUTH_TOKEN_STORAGE_KEY, token))
}

/**
 * Clears the stored auth token from memory and session storage.
 */
function clearStoredAuthToken(): void {
  inMemoryAuthToken = undefined

  const storage = getSessionStorage()
  if (!storage) {
    return
  }

  asResult(() => storage.removeItem(AUTH_TOKEN_STORAGE_KEY))
}

/**
 * Verifies the provided auth token by making a request to the server.
 *
 * @param {string} token - The auth token to verify.
 * @return {Promise<Result<void>>} A promise that resolves to success when valid, or an error describing why verification failed.
 */
async function verifyAuthToken(token: string): Promise<Result<void>> {
  const [fetchError, res] = await asAsyncResult(async () => {
    return await fetch("/api/auth/verify", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
  })

  if (fetchError) {
    return [new Error("Auth verification failed (network error)"), null]
  }

  if (res.status === 204) {
    return [null, undefined]
  }

  // Try to extract error message from response body, but fall back to a generic message if that fails or is empty.
  const [readError, text] = await asAsyncResult(() => res.text())

  if (readError || !text) {
    return [new Error(`Auth failed (${res.status})`), null]
  }

  return [new Error(text), null]
}

/**
 * Checks if an auth token is required by the server, and if so, prompts the user to enter it until a valid token is provided.
 * The token is stored in session storage for the duration of the browser session.
 *
 * @return {Promise<string | undefined>} A promise that resolves to the valid auth token, or `undefined` if no auth is required.
 */
export async function getAuthTokenIfRequired(): Promise<string | undefined> {
  const [configError, config] = await fetchServerConfig()
  if (configError) {
    return undefined
  }

  if (!config.authRequired) return undefined

  const existingToken = getStoredAuthToken()

  if (existingToken) {
    const [verificationError] = await verifyAuthToken(existingToken)

    if (!verificationError) {
      return existingToken
    }

    clearStoredAuthToken()
  }

  let lastError = ""

  for (;;) {
    const promptText = lastError ? `Auth token\n\n${lastError}\n\nEnter token:` : "Auth token\n\nEnter token:"

    const input = window.prompt(promptText, "")

    // Token is required to use the app when the server enforces auth. Keep prompting.
    if (input === null) continue

    const token = input.trim()
    if (!token) {
      lastError = "Token is required"
      continue
    }

    const [verificationError] = await verifyAuthToken(token)

    if (!verificationError) {
      storeAuthToken(token)

      return token
    }

    lastError = verificationError.message || "Invalid auth token"
  }
}
