import type { Terminal } from "ghostty-web"
import { asResult } from "@/utils/safe-result"

/**
 * Gets an element by selector, throwing an error if it doesn't exist.
 *
 * @param {string} selector The CSS selector of the element to get.
 * @returns {HTMLElement} The HTML element matching the selector.
 */
export function getElement(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector)

  if (!el) throw new Error(`Missing ${selector}`)

  return el
}

/**
 * Checks if the given element has a width that is less than the typical breakpoint for mobile devices (768 pixels).
 *
 * @param {HTMLElement} element The DOM element to check the width of.
 * @return {boolean} True if the element's width is less than 768 pixels, indicating a mobile device; otherwise, false.
 */
export function hasMobileWidth(element: HTMLElement): boolean {
  return element.getBoundingClientRect().width < 768
}

export type Orientation = "portrait" | "landscape"

/**
 * Determines the current orientation of the device based on the aspect ratio of the body element.
 * This is a simple heuristic that works in most cases.
 *
 * @return {Orientation} The current orientation, either "portrait" or "landscape".
 */
export function getOrientation(): Orientation {
  const rect = document.body.getBoundingClientRect()
  return rect.height > rect.width ? "portrait" : "landscape"
}

/**
 * Checks if the virtual keyboard is likely visible by comparing the visual viewport height to the window inner height.
 * If the difference is greater than a certain threshold, we assume the keyboard is visible.
 *
 * @return {boolean} True if the virtual keyboard is likely visible, otherwise false.
 */
export function isVirtualKeyboardVisible(): boolean {
  const MIN_DISPLACED_HEIGHT = 100 // ignore small resizes that are likely just browser UI changes
  const viewport = window.visualViewport

  if (!viewport) {
    return false
  }

  const viewportHeight = viewport.height ?? window.innerHeight
  const displacedHeight = window.innerHeight - viewportHeight

  return displacedHeight > MIN_DISPLACED_HEIGHT
}

/**
 * Resolves the closest button element from a click event target.
 *
 * @param {Event} event The click event that was fired.
 * @returns {HTMLButtonElement | null} The closest button that was clicked, if one exists.
 */
export function getClickedButton(event: Event): HTMLButtonElement | null {
  const target = event.target
  if (!(target instanceof Element)) return null

  const button = target.closest("button")
  if (!(button instanceof HTMLButtonElement)) return null
  return button
}

/**
 * Checks if the current device is touch-capable.
 *
 * @return {boolean} True if the device is touch-capable, otherwise false.
 */
export function isTouchCapableDevice(): boolean {
  // First checking the maxTouchPoints property.
  if (navigator.maxTouchPoints > 0) return true

  // Use media query as fallback.
  return window.matchMedia("(pointer: coarse)").matches
}

/**
 * Dispatches a synthetic wheel event on the target element with the specified parameters.
 *
 * @param {HTMLElement} target - The element to dispatch the wheel event on.
 * @param {number} clientX - The X coordinate of the pointer event that triggered the scroll.
 * @param {number} clientY - The Y coordinate of the pointer event that triggered the scroll.
 * @param {number} deltaY - The amount of vertical scroll (positive for scrolling down, negative for scrolling up).
 */
export function dispatchWheelEvent(target: HTMLElement, clientX: number, clientY: number, deltaY: number): void {
  target.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      deltaY,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    }),
  )
}

/**
 * Safely accesses the window.sessionStorage object, returning undefined if it is not available or accessible.
 *
 * @return {Storage | undefined} The sessionStorage object if accessible, otherwise undefined.
 */
export function getSessionStorage(): Storage | undefined {
  const [error, storage] = asResult(() => window.sessionStorage)
  if (error) {
    return undefined
  }

  return storage
}

/**
 * Checks whether a port value is the default for the given protocol.
 *
 * @param {string} protocol The current page protocol (for example, "http:" or "https:").
 * @param {string} port The numeric port string from the location object.
 * @returns {boolean} True when the port is the protocol's default port.
 */
function isDefaultProtocolPort(protocol: string, port: string): boolean {
  if (protocol === "http:" && port === "80") {
    return true
  }

  if (protocol === "https:" && port === "443") {
    return true
  }

  return false
}

/**
 * Prettifies a hostname for display, preserving IPv6 readability.
 *
 * Examples:
 *  - "localhost" -> "localhost", "127.0.0.1" -> "127.0.1"
 *  - "::1" -> "[::1]", "2001:db8::1" -> "[2001:db8::1]"
 *
 * @param {string} hostname The hostname to prettify, which may be an IPv4 or IPv6 address.
 * @returns {string} A display-safe host string, with IPv6 wrapped in brackets.
 */
function getPrettifiedHost(hostname: string): string {
  if (hostname.includes(":") && !(hostname.startsWith("[") && hostname.endsWith("]"))) {
    return `[${hostname}]`
  }

  return hostname
}

/**
 * Extractes the origin parts (scheme, host, and optional port) from the current window location.
 *
 * @returns {{scheme: string; host: string; port: string}} The scheme, host, and optional port label.
 */
export function getOriginParts(): { scheme: string; host: string; port: string } {
  const { hostname, port, protocol } = window.location
  const scheme = protocol === "https:" ? "https://" : "http://"
  const host = getPrettifiedHost(hostname)

  if (!port || isDefaultProtocolPort(protocol, port)) {
    return { scheme, host, port: "" }
  }

  return { scheme, host, port: `:${port}` }
}

/**
 * Returns true when the terminal is currently on the normal screen (not an alternate screen used by a full-screen app).
 *
 * @param {Terminal} term The terminal instance to check.
 * @returns {boolean} True when the terminal is currently on the normal screen.
 */
export function isNormalScreen(term: Terminal): boolean {
  return term.buffer.active.type === "normal"
}
