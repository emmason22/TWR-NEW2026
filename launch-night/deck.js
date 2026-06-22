(function () {
  const slides = window.TWRLaunchNightSlides || [];
  const byId = new Map(slides.map((slide, index) => [slide.id, { slide, index }]));

  const getSlideIdFromPath = () => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "launch-night") return slides[0]?.id;
    return parts[1] || "controller";
  };

  const slideUrl = (slide) => `/launch-night/${slide.id}/`;
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const renderBackground = (slide) => {
    if (slide.kind === "video" && slide.poster) {
      return `<div class="slide-bg"><img src="${escapeHtml(slide.poster)}" alt="" /></div>`;
    }
    if (slide.image) {
      return `<div class="slide-bg"><img src="${escapeHtml(slide.image)}" alt="" /></div>`;
    }
    return '<div class="slide-bg"></div>';
  };

  const renderBullets = (items) => {
    if (!items || !items.length) return "";
    return `<ul class="deck-bullets">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  };

  const renderBody = (slide) => {
    switch (slide.kind) {
      case "site-preview":
        return `
          <div class="deck-site-preview">
            <iframe src="${escapeHtml(slide.siteUrl || "/")}" title="${escapeHtml(slide.title)}"></iframe>
          </div>
        `;
      case "logo-title":
        return `
          <div class="deck-logo-title">
            <img src="${escapeHtml(slide.logo || "/assets/TonightWeRideLogo.png")}" alt="Tonight We Ride" />
            ${slide.subtitle ? `<p>${escapeHtml(slide.subtitle)}</p>` : ""}
          </div>
        `;
      case "video":
        return `
          <div class="deck-video-frame">
            <video
              class="deck-video"
              src="${escapeHtml(slide.video)}"
              ${slide.poster ? `poster="${escapeHtml(slide.poster)}"` : ""}
              controls
              playsinline
              preload="metadata"
            ></video>
          </div>
        `;
      case "photo-grid":
        return `<div class="deck-photo-grid">${(slide.images || []).map((src) => `<img src="${escapeHtml(src)}" alt="" />`).join("")}</div>`;
      case "link-grid":
        return `<div class="deck-link-grid">${(slide.links || []).map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("")}</div>`;
      case "process":
        return `<ol class="deck-steps">${(slide.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
      case "three-cards":
        return `<div class="deck-cards">${(slide.cards || []).map((card) => `
          <a href="${escapeHtml(card.href)}" target="_blank" rel="noopener noreferrer">
            <p class="card-title">${escapeHtml(card.title)}</p>
            <p class="card-subtitle">${escapeHtml(card.subtitle)}</p>
          </a>
        `).join("")}</div>`;
      case "tiers":
        return `<ul class="deck-tiers">${(slide.tiers || []).map((tier) => `
          <li>
            <p class="tier-name">${escapeHtml(tier.name)}</p>
            <p class="tier-amount">${escapeHtml(tier.amount)}</p>
          </li>
        `).join("")}</ul>`;
      case "dashboard":
        return `<ul class="deck-stats">${(slide.stats || []).map((stat) => `
          <li>
            <p class="stat-value">${escapeHtml(stat.value)}</p>
            <p class="stat-label">${escapeHtml(stat.label)}</p>
          </li>
        `).join("")}</ul>`;
      default:
        return renderBullets(slide.bullets);
    }
  };

  const renderControls = (slide, index) => {
    const previous = slides[index - 1];
    const next = slides[index + 1];
    const links = (slide.links || []).map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("");
    return `
      <nav class="presenter-controls" aria-label="Presenter controls">
        ${previous ? `<a href="${slideUrl(previous)}">Prev</a>` : '<a href="/launch-night/">Hub</a>'}
        ${next ? `<a href="${slideUrl(next)}">Next</a>` : '<a href="/launch-night/">Hub</a>'}
        <a href="/launch-night/">Hub</a>
        ${links}
      </nav>
    `;
  };

  const renderSideArrows = (index) => {
    const previous = slides[index - 1];
    const next = slides[index + 1];
    return `
      <nav class="slide-side-arrows" aria-label="Slide navigation">
        ${previous ? `<a class="slide-arrow slide-arrow-left" href="${slideUrl(previous)}" aria-label="Previous slide">‹</a>` : ""}
        ${next ? `<a class="slide-arrow slide-arrow-right" href="${slideUrl(next)}" aria-label="Next slide">›</a>` : ""}
      </nav>
    `;
  };

  const renderSlide = (slide, index) => {
    const titleClass = slide.title && slide.title.length > 34 ? "deck-title is-long" : "deck-title";
    const slideClass = slide.kind === "video" ? "slide is-video" : slide.kind === "logo-title" ? "slide is-logo-title" : slide.kind === "site-preview" ? "slide is-site-preview" : "slide";
    document.title = `${String(index + 1).padStart(2, "0")} ${slide.title} | TWR Launch Night`;
    document.body.className = "deck-page";
    document.body.innerHTML = `
      <main class="deck-shell" aria-label="${escapeHtml(slide.title)}">
        ${renderBackground(slide)}
        <section class="${slideClass}">
          <div class="slide-topbar">
            <img class="slide-logo" src="/assets/TonightWeRideLogo.png" alt="Tonight We Ride" />
          </div>
          <div class="slide-main">
            ${slide.eyebrow ? `<p class="deck-eyebrow">${escapeHtml(slide.eyebrow)}</p>` : ""}
            ${slide.kind !== "logo-title" && slide.kind !== "site-preview" ? `<h1 class="${titleClass}">${escapeHtml(slide.title)}</h1>` : ""}
            ${slide.subtitle && slide.kind !== "logo-title" && slide.kind !== "site-preview" ? `<p class="deck-subtitle">${escapeHtml(slide.subtitle)}</p>` : ""}
            ${slide.accent ? `<p class="deck-accent">${escapeHtml(slide.accent)}</p>` : ""}
            ${renderBody(slide)}
          </div>
          <div class="slide-footer">
            <span>Tonight We Ride</span>
            <span>${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}</span>
          </div>
        </section>
        ${renderSideArrows(index)}
        ${renderControls(slide, index)}
      </main>
    `;
  };

  const renderController = () => {
    document.title = "Launch Night Deck | Tonight We Ride";
    document.body.className = "controller-page";
    document.body.innerHTML = `
      <header class="controller-header">
        <img src="/assets/TonightWeRideLogo.png" alt="Tonight We Ride" />
        <div>
          <p class="deck-eyebrow">Presenter Hub</p>
          <h1>Launch Night Run Of Show</h1>
        </div>
      </header>
      <main class="controller-grid" aria-label="Launch night slides">
        ${slides.map((slide, index) => `
          <a class="controller-card" href="${slideUrl(slide)}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(slide.title)}</strong>
            <em>${escapeHtml(slide.eyebrow || "")}</em>
          </a>
        `).join("")}
      </main>
    `;
  };

  const goRelative = (direction) => {
    const current = byId.get(getSlideIdFromPath());
    if (!current) return;
    const target = slides[current.index + direction];
    if (target) window.location.href = slideUrl(target);
  };

  let lastWheelNav = 0;
  let touchStartY = 0;

  const canNavigateFromEventTarget = (target) => {
    const active = target || document.activeElement;
    if (!active) return true;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(active.tagName)) return false;
    if (active.closest && active.closest("video, .presenter-controls, iframe")) return false;
    return true;
  };

  window.addEventListener("keydown", (event) => {
    if (!canNavigateFromEventTarget(document.activeElement)) return;
    if (event.key === "ArrowRight" || event.key === " ") {
      event.preventDefault();
      goRelative(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goRelative(-1);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      window.location.href = "/launch-night/";
    }
  });

  window.addEventListener("wheel", (event) => {
    if (!canNavigateFromEventTarget(event.target)) return;
    if (Math.abs(event.deltaY) < 45) return;
    const now = Date.now();
    if (now - lastWheelNav < 850) return;
    lastWheelNav = now;
    event.preventDefault();
    goRelative(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener("touchstart", (event) => {
    if (!canNavigateFromEventTarget(event.target)) return;
    touchStartY = event.changedTouches[0]?.clientY || 0;
  }, { passive: true });

  window.addEventListener("touchend", (event) => {
    if (!canNavigateFromEventTarget(event.target)) return;
    const touchEndY = event.changedTouches[0]?.clientY || 0;
    const deltaY = touchStartY - touchEndY;
    if (Math.abs(deltaY) < 60) return;
    goRelative(deltaY > 0 ? 1 : -1);
  }, { passive: true });

  const currentId = getSlideIdFromPath();
  if (currentId === "controller") {
    renderController();
    return;
  }

  const current = byId.get(currentId) || byId.get(slides[0]?.id);
  if (current) renderSlide(current.slide, current.index);
})();
