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

  const renderSlide = (slide, index) => {
    const titleClass = slide.title && slide.title.length > 34 ? "deck-title is-long" : "deck-title";
    const slideClass = slide.kind === "video" ? "slide is-video" : "slide";
    document.title = `${String(index + 1).padStart(2, "0")} ${slide.title} | TWR Launch Night`;
    document.body.className = "deck-page";
    document.body.innerHTML = `
      <main class="deck-shell" aria-label="${escapeHtml(slide.title)}">
        ${renderBackground(slide)}
        <section class="${slideClass}">
          <div class="slide-topbar">
            <img class="slide-logo" src="/assets/TonightWeRideLogo.png" alt="Tonight We Ride" />
            <p class="slide-time">${escapeHtml(slide.time || "Launch Night")}</p>
          </div>
          <div class="slide-main">
            <p class="deck-eyebrow">${escapeHtml(slide.eyebrow)}</p>
            <h1 class="${titleClass}">${escapeHtml(slide.title)}</h1>
            ${slide.subtitle ? `<p class="deck-subtitle">${escapeHtml(slide.subtitle)}</p>` : ""}
            ${slide.accent ? `<p class="deck-accent">${escapeHtml(slide.accent)}</p>` : ""}
            ${renderBody(slide)}
          </div>
          <div class="slide-footer">
            <span>Tonight We Ride</span>
            <span>${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}</span>
          </div>
        </section>
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
            <span>${String(index + 1).padStart(2, "0")} ${escapeHtml(slide.time || "")}</span>
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

  window.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
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

  const currentId = getSlideIdFromPath();
  if (currentId === "controller") {
    renderController();
    return;
  }

  const current = byId.get(currentId) || byId.get(slides[0]?.id);
  if (current) renderSlide(current.slide, current.index);
})();
