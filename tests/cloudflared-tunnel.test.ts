import { describe, expect, test } from "bun:test"
import { getCloudflaredTargetUrl, parseCloudflaredTunnelUrl } from "@/utils/cloudflared-tunnel"

describe("cloudflared tunnel helpers", () => {
  test("parses trycloudflare quick tunnel URLs from output", () => {
    const url = parseCloudflaredTunnelUrl(
      "2026-01-01 INF +--------------------------------------------------------------------------------------------+\nhttps://example-tunnel.trycloudflare.com\n",
    )

    expect(url).toBe("https://example-tunnel.trycloudflare.com")
  })

  test("returns undefined when output does not contain a tunnel URL", () => {
    expect(parseCloudflaredTunnelUrl("Starting tunnel... no url yet")).toBeUndefined()
  })

  test("uses loopback target for local server URLs", () => {
    expect(getCloudflaredTargetUrl(new URL("http://localhost:31337/"))).toBe("http://127.0.0.1:31337/")
    expect(getCloudflaredTargetUrl(new URL("http://127.0.0.1:31337/"))).toBe("http://127.0.0.1:31337/")
  })

  test("uses loopback target for wildcard server URLs", () => {
    expect(getCloudflaredTargetUrl(new URL("http://0.0.0.0:31337/"))).toBe("http://127.0.0.1:31337/")
  })

  test("keeps concrete non-local server URLs", () => {
    expect(getCloudflaredTargetUrl(new URL("http://192.168.1.40:31337/"))).toBe("http://192.168.1.40:31337/")
  })
})
