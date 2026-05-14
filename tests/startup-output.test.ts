import { describe, expect, test } from "bun:test"
import type { NetworkInterfaceInfo, networkInterfaces } from "node:os"
import { getLanAccessHost, printStartupAccess, renderQrCode, resolveStartupAccessUrl } from "@/utils/startup-output"

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>

/**
 * Creates an IPv4 network interface entry for startup URL tests.
 *
 * @param {string} address IPv4 address.
 * @param {boolean} internal Whether the interface is internal.
 * @returns {NetworkInterfaceInfo} Network interface info.
 */
function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  }
}

/**
 * Captures console.log output while running a callback.
 *
 * @param {() => void} callback Callback to run while console.log is captured.
 * @returns {string[]} Captured console.log lines.
 */
function captureConsoleLog(callback: () => void): string[] {
  const logs: string[] = []
  const originalLog = console.log

  console.log = (...values: unknown[]): void => {
    logs.push(values.map(String).join(" "))
  }

  try {
    callback()
  } finally {
    console.log = originalLog
  }

  return logs
}

/**
 * Temporarily overrides stdout TTY detection while running a callback.
 *
 * @param {boolean | undefined} isTTY Value exposed as process.stdout.isTTY.
 * @param {() => void} callback Callback to run while stdout.isTTY is overridden.
 * @returns {void}
 */
function withStdoutIsTTY(isTTY: boolean | undefined, callback: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")

  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: isTTY,
  })

  try {
    callback()
  } finally {
    if (descriptor) {
      Object.defineProperty(process.stdout, "isTTY", descriptor)
    } else {
      delete (process.stdout as Partial<NodeJS.WriteStream>).isTTY
    }
  }
}

describe("startup output", () => {
  test("keeps local URLs local-only", () => {
    const access = resolveStartupAccessUrl(new URL("http://127.0.0.1:31337/"), {})

    expect(access.url).toBe("http://127.0.0.1:31337/")
    expect(access.shouldPrintResolvedUrl).toBe(false)
  })

  test("uses a LAN address for wildcard binds", () => {
    const interfaces: NetworkInterfaceMap = {
      lo: [ipv4("127.0.0.1", true)],
      wlan0: [ipv4("192.168.1.40")],
    }
    const access = resolveStartupAccessUrl(new URL("http://0.0.0.0:31337/"), interfaces)

    expect(access.url).toBe("http://192.168.1.40:31337/")
    expect(access.shouldPrintResolvedUrl).toBe(true)
  })

  test("falls back to wildcard URL when no LAN address exists", () => {
    const access = resolveStartupAccessUrl(new URL("http://0.0.0.0:31337/"), { lo: [ipv4("127.0.0.1", true)] })

    expect(access.url).toBe("http://0.0.0.0:31337/")
    expect(access.shouldPrintResolvedUrl).toBe(false)
  })

  test("marks concrete non-local hosts as resolved URL candidates", () => {
    const access = resolveStartupAccessUrl(new URL("http://192.168.1.50:31337/"), {})

    expect(access.url).toBe("http://192.168.1.50:31337/")
    expect(access.shouldPrintResolvedUrl).toBe(true)
  })

  test("does not print when the resolved URL matches the server URL", () => {
    const logs = captureConsoleLog(() => {
      printStartupAccess(new URL("http://192.168.1.50:31337/"))
    })

    expect(logs).toEqual([])
  })

  test("prints resolved URL without QR code when stdout is not interactive", () => {
    const interfaces: NetworkInterfaceMap = {
      wlan0: [ipv4("192.168.1.40")],
    }
    let logs: string[] = []

    withStdoutIsTTY(false, () => {
      logs = captureConsoleLog(() => {
        printStartupAccess(new URL("http://0.0.0.0:31337/"), interfaces)
      })
    })

    expect(logs).toEqual(["Resolved URL: http://192.168.1.40:31337/\n"])
  })

  test("prints resolved URL with QR code when stdout is interactive", () => {
    const interfaces: NetworkInterfaceMap = {
      wlan0: [ipv4("192.168.1.40")],
    }
    let logs: string[] = []

    withStdoutIsTTY(true, () => {
      logs = captureConsoleLog(() => {
        printStartupAccess(new URL("http://0.0.0.0:31337/"), interfaces)
      })
    })

    expect(logs).toHaveLength(2)
    expect(logs[0]).toBe("Resolved URL: http://192.168.1.40:31337/\n")
    expect(logs[1]).toContain("\n")
  })

  test("prefers primary LAN interfaces over other adapters", () => {
    const interfaces: NetworkInterfaceMap = {
      docker0: [ipv4("172.17.0.1")],
      en0: [ipv4("192.168.1.40")],
    }

    expect(getLanAccessHost(interfaces)).toBe("192.168.1.40")
  })

  test("renders terminal QR code output", () => {
    const qrCode = renderQrCode("http://127.0.0.1:31337/")

    expect(qrCode.length).toBeGreaterThan(0)
    expect(qrCode).toContain("\n")
  })
})
