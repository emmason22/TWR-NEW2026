/**
 * Asset fallback + visible error handling
 * - Replaces missing images with a visible placeholder that shows the expected file path.
 * - Shows a visible error overlay if the hero video fails to load.
 */

function replaceWithMissingAsset(el, expectedPath, altText) {
  const div = document.createElement("div");
  div.className = "asset-missing";
  div.setAttribute("role", "img");
  div.setAttribute("aria-label", altText || "Missing asset");

  div.innerHTML = `
    <strong>Missing asset</strong><br/>
    <span>${altText || "This media file could not be loaded."}</span><br/>
    <span>Expected: <code>${expectedPath}</code></span>
  `;

  el.replaceWith(div);
}

function initImageFallbacks() {
  const imgs = document.querySelectorAll("img[data-asset]");
  imgs.forEach((img) => {
    img.addEventListener("error", () => {
      const expected = img.getAttribute("data-asset") || img.getAttribute("src") || "(unknown path)";
      const alt = img.getAttribute("alt") || "Image asset";
      replaceWithMissingAsset(img, expected, alt);
    });
  });
}

function initHeroVideoFallback() {
  const hero = document.querySelector(".hero");
  const video = document.querySelector(".hero-video");
  const errorBox = document.querySelector(".hero-video-error");

  if (!video) return;

  video.addEventListener("error", () => {
    if (errorBox) errorBox.style.display = "block";
    if (hero) hero.classList.add("hero-video-failed");
    console.warn("Hero video failed to load:", video.getAttribute("data-asset") || video.currentSrc);
  });
}

function initPlaceholderLinksNotice() {
  const placeholders = document.querySelectorAll("[data-placeholder-href='true']");
  placeholders.forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      console.info("Placeholder link clicked. Update href for:", a.textContent.trim());
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initImageFallbacks();
  initHeroVideoFallback();
  initPlaceholderLinksNotice();
});
