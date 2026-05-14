import { describe, expect, test } from "bun:test"
import { getAuthToken } from "@/lib/server/auth"

describe("auth token resolution", () => {
  test("uses configured auth token", () => {
    expect(getAuthToken("secret", "127.0.0.1", true)).toEqual({ authToken: "secret", isGenerated: false })
  })

  test("does not generate auth token for local hosts by default", () => {
    expect(getAuthToken(undefined, "127.0.0.1")).toEqual({ authToken: undefined, isGenerated: false })
  })

  test("generates auth token when auth is forced", () => {
    const result = getAuthToken(undefined, "127.0.0.1", true)

    expect(typeof result.authToken).toBe("string")
    expect(result.authToken?.length).toBeGreaterThan(0)
    expect(result.isGenerated).toBe(true)
  })
})
