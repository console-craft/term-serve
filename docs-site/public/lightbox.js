const imageSelector = ".hero > img, .sl-markdown-content img, .ts-frame img"

let dialog
let dialogImage
let dialogCaption
let closeTimer

/**
 * Returns true when an image should be available in the lightbox.
 * @param {HTMLImageElement} image The candidate image element.
 * @returns {boolean} Whether the image is visible and has a source.
 */
function isLightboxImage(image) {
  return Boolean(image.currentSrc || image.src) && image.offsetParent !== null
}

/**
 * Gets the best caption text for an image.
 * @param {HTMLImageElement} image The image being opened.
 * @returns {string} Caption text from a figure caption or alt text.
 */
function getCaption(image) {
  const caption = image.closest("figure")?.querySelector("figcaption")?.textContent?.trim()
  return caption || image.alt || ""
}

/**
 * Gets the largest width candidate from an image srcset.
 * @param {string} srcset The srcset attribute value.
 * @returns {string} The URL for the largest width candidate, or an empty string.
 */
function getLargestSrcsetUrl(srcset) {
  return (
    srcset
      .split(",")
      .map((candidate) => {
        const [url, descriptor = ""] = candidate.trim().split(/\s+/)
        const width = descriptor.endsWith("w") ? Number.parseInt(descriptor, 10) : 0
        return { url, width }
      })
      .filter((candidate) => candidate.url)
      .sort((a, b) => b.width - a.width)[0]?.url ?? ""
  )
}

/**
 * Gets the best available source URL for the lightbox preview.
 * @param {HTMLImageElement} image The image being opened.
 * @returns {string} The highest quality source URL available in the DOM.
 */
function getLightboxSource(image) {
  return image.dataset.lightboxSrc || getLargestSrcsetUrl(image.srcset) || image.currentSrc || image.src
}

/**
 * Opens the shared lightbox dialog for an image.
 * @param {HTMLImageElement} image The image to show.
 * @returns {void}
 */
function openLightbox(image) {
  if (!dialog || !dialogImage || !dialogCaption || !isLightboxImage(image)) {
    return
  }

  clearTimeout(closeTimer)
  dialog.classList.remove("ts-lightbox--closing")
  dialogImage.src = getLightboxSource(image)
  dialogImage.alt = image.alt
  dialogCaption.textContent = getCaption(image)
  dialogCaption.hidden = dialogCaption.textContent.length === 0
  dialog.showModal()
}

/**
 * Closes the shared lightbox after playing its exit animation.
 * @returns {void}
 */
function closeLightbox() {
  if (!dialog?.open || dialog.classList.contains("ts-lightbox--closing")) {
    return
  }

  dialog.classList.add("ts-lightbox--closing")
  closeTimer = setTimeout(() => {
    dialog?.close()
  }, 160)
}

/**
 * Creates the shared lightbox dialog.
 * @returns {HTMLDialogElement} The dialog element.
 */
function createDialog() {
  const lightbox = document.createElement("dialog")
  lightbox.className = "ts-lightbox"
  lightbox.innerHTML = `
    <button class="ts-lightbox__close" type="button" aria-label="Close image preview">🗙</button>
    <figure class="ts-lightbox__figure">
      <img class="ts-lightbox__image" alt="" />
      <figcaption class="ts-lightbox__caption"></figcaption>
    </figure>
  `

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox()
    }
  })
  lightbox.addEventListener("cancel", (event) => {
    event.preventDefault()
    closeLightbox()
  })
  lightbox.addEventListener("close", () => {
    lightbox.classList.remove("ts-lightbox--closing")
  })
  lightbox.querySelector("button")?.addEventListener("click", closeLightbox)

  document.body.append(lightbox)
  return lightbox
}

/**
 * Adds click and keyboard activation behavior to an image.
 * @param {HTMLImageElement} image The image to enhance.
 * @returns {void}
 */
function enhanceImage(image) {
  if (image.dataset.lightboxEnhanced === "true") {
    return
  }

  image.dataset.lightboxEnhanced = "true"
  image.tabIndex = 0
  image.role = "button"
  image.title ||= "Open image preview"
  image.addEventListener("click", () => openLightbox(image))
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openLightbox(image)
    }
  })
}

/**
 * Initializes image lightbox behavior for the page.
 * @returns {void}
 */
function initLightbox() {
  dialog = createDialog()
  dialogImage = dialog.querySelector(".ts-lightbox__image")
  dialogCaption = dialog.querySelector(".ts-lightbox__caption")
  document.querySelectorAll(imageSelector).forEach((image) => {
    if (image instanceof HTMLImageElement) {
      enhanceImage(image)
    }
  })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLightbox, { once: true })
} else {
  initLightbox()
}
