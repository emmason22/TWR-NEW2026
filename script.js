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
  const imgs = document.querySelectorAll("img");
  imgs.forEach((img) => {
    img.addEventListener("error", () => {
      const expected = img.getAttribute("data-asset") || img.getAttribute("src") || "(unknown path)";
      const alt = img.getAttribute("alt") || "Image asset";
      const currentSrc = img.getAttribute("src") || "";

      // Attempt likely extension/case variants before showing missing placeholder.
      const triedSet = new Set(
        (img.dataset.fallbackTried || "")
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
      );
      triedSet.add(currentSrc);

      const candidates = [];
      if (expected && expected !== currentSrc) {
        candidates.push(expected);
      }

      const extMatch = currentSrc.match(/\.(jpg|jpeg|png|webp|gif)$/i);
      if (extMatch) {
        const ext = extMatch[1];
        const base = currentSrc.slice(0, -ext.length);
        const extVariants = [ext.toLowerCase(), ext.toUpperCase()];
        if (ext.toLowerCase() === "jpg") extVariants.push("jpeg");
        if (ext.toLowerCase() === "jpeg") extVariants.push("jpg");
        extVariants.forEach((variant) => {
          candidates.push(`${base}${variant}`);
        });
      }

      const nextSrc = candidates.find((candidate) => candidate && !triedSet.has(candidate));
      if (nextSrc) {
        triedSet.add(nextSrc);
        img.dataset.fallbackTried = Array.from(triedSet).join("|");
        img.src = nextSrc;
        return;
      }

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
