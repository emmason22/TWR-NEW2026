const APPS_SCRIPT_WEB_APP_URL = "APPS_SCRIPT_WEB_APP_URL";

function serializeForm(form) {
  const data = new FormData(form);
  const out = {};
  for (const [key, value] of data.entries()) {
    out[key] = String(value).trim();
  }
  return out;
}

function getMetaContent(name) {
  const meta = document.querySelector(`meta[name='${name}']`);
  return meta && meta.content ? meta.content.trim() : "";
}

function getFormEndpoint(form) {
  const formEndpoint = form.getAttribute("data-endpoint");
  if (formEndpoint) return formEndpoint;
  return getMetaContent("twr-form-endpoint");
}

function isLiveEndpoint(endpoint) {
  const normalized = String(endpoint || "").trim();
  return Boolean(normalized && normalized !== APPS_SCRIPT_WEB_APP_URL);
}

function getAnalyticsEndpoint() {
  return getMetaContent("twr-analytics-endpoint");
}

function emitTelemetry(eventType, details) {
  const payload = {
    eventType,
    page: window.location.pathname,
    timestamp: new Date().toISOString(),
    details,
  };

  console.info("TWR telemetry:", payload);

  const endpoint = getAnalyticsEndpoint();
  if (!endpoint) return;

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    } catch (error) {
      console.warn("sendBeacon failed; falling back to fetch", error);
    }
  }

  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((error) => {
    console.warn("Telemetry request failed", error);
  });
}

function setSubmittingState(form, isSubmitting) {
  const submitBtn = form.querySelector("button[type='submit']");
  if (!submitBtn) return;
  submitBtn.disabled = isSubmitting;
  submitBtn.setAttribute("aria-busy", isSubmitting ? "true" : "false");
}

function setStatusMessage(statusEl, message, state = "info") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.setAttribute("data-state", state);
  statusEl.classList.remove("status-burst");
  // Restart small entrance animation when message changes.
  void statusEl.offsetWidth;
  statusEl.classList.add("status-burst");
}

async function submitPayload(endpoint, payload) {
  try {
    await submitPayloadJson(endpoint, payload);
  } catch (postError) {
    // Some Apps Script deployments redirect POST to a GET-only URL.
    if (!shouldTryGetFallback(postError)) {
      throw postError;
    }
    await submitPayloadQuery(endpoint, payload);
  }
}

function shouldTryGetFallback(error) {
  const message = String(error || "").toLowerCase();
  return (
    message.includes("status 405") ||
    message.includes("non-json response") ||
    message.includes("empty response")
  );
}

async function submitPayloadJson(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  return parseSubmissionResponse(response);
}

async function submitPayloadQuery(endpoint, payload) {
  const url = new URL(endpoint);
  Object.entries(payload).forEach(([key, value]) => {
    url.searchParams.set(key, value == null ? "" : String(value));
  });

  const response = await fetch(url.toString(), {
    method: "GET",
  });

  return parseSubmissionResponse(response);
}

async function parseSubmissionResponse(response) {
  if (!response.ok) {
    throw new Error(`Submission failed with status ${response.status}`);
  }

  const responseText = await response.text();
  if (!responseText) {
    throw new Error("Submission endpoint returned an empty response.");
  }

  let parsed = null;
  try {
    parsed = JSON.parse(responseText);
  } catch (_) {
    throw new Error("Submission endpoint returned a non-JSON response.");
  }

  if (!parsed || parsed.ok !== true) {
    throw new Error((parsed && parsed.error) || "Submission was rejected by endpoint.");
  }
}

function toBoolean(value) {
  return value === "yes" || value === "on" || value === "true" || value === "1";
}

function buildGoogleSheetsPayload(form, payload) {
  const tab = (form.getAttribute("data-sheet-tab") || "").trim();
  if (!tab) return null;

  const submittedAt = new Date().toISOString();
  const optedIn = toBoolean(payload.email_opt_in);
  const mailerliteStatus = optedIn ? "pending" : "skipped";
  const mailerliteGroup = form.getAttribute("data-mailerlite-group") || tab;

  if (tab === "Need Help") {
    return {
      tab,
      submitted_at: submittedAt,
      status: "new",
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone || "",
      person_needing_help: payload.person_needing_help || "",
      request: payload.request || "",
      email_opt_in: optedIn ? "yes" : "no",
      mailerlite_group: mailerliteGroup,
      mailerlite_status: mailerliteStatus,
      internal_notes: "",
    };
  }

  if (tab === "Veteran Outreach") {
    return {
      tab,
      submitted_at: submittedAt,
      status: "new",
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone || "",
      branch: payload.branch || "",
      request: payload.request || "",
      email_opt_in: optedIn ? "yes" : "no",
      mailerlite_group: mailerliteGroup,
      mailerlite_status: mailerliteStatus,
      internal_notes: "",
    };
  }

  if (tab === "Homeless Outreach") {
    return {
      tab,
      submitted_at: submittedAt,
      status: "new",
      intake_type: payload.intake_type || "Request Support",
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone || "",
      request: payload.request || "",
      email_opt_in: optedIn ? "yes" : "no",
      mailerlite_group: mailerliteGroup,
      mailerlite_status: mailerliteStatus,
      internal_notes: "",
    };
  }

  if (tab === "Crisis Relief") {
    return {
      tab,
      submitted_at: submittedAt,
      status: "new",
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone || "",
      city_area: payload.city_area || "",
      crisis_type: payload.crisis_type || "",
      request: payload.request || "",
      email_opt_in: optedIn ? "yes" : "no",
      mailerlite_group: mailerliteGroup,
      mailerlite_status: mailerliteStatus,
      internal_notes: "",
    };
  }

  return null;
}

function getRateLimitKey(formName) {
  return `twr_form_last_submit_${formName.toLowerCase().replace(/\s+/g, "_")}`;
}

function isRateLimited(formName) {
  const key = getRateLimitKey(formName);
  const lastTs = Number(localStorage.getItem(key) || "0");
  const now = Date.now();
  const minIntervalMs = 15 * 1000;

  if (now - lastTs < minIntervalMs) {
    return true;
  }

  localStorage.setItem(key, String(now));
  return false;
}

function setFieldValidityState(field) {
  if (!field || !field.willValidate) return;
  field.setAttribute("aria-invalid", field.checkValidity() ? "false" : "true");
}

function clearFormValidityStates(form) {
  form.querySelectorAll("input, textarea, select").forEach((field) => {
    if (!field.willValidate) return;
    field.setAttribute("aria-invalid", "false");
  });
}

function applyAutocompleteHint(field) {
  if (!field || field.hasAttribute("autocomplete")) return;

  const key = `${field.name || ""} ${field.id || ""}`.toLowerCase();
  if (key.includes("email")) {
    field.setAttribute("autocomplete", "email");
    return;
  }
  if (key.includes("phone") || key.includes("contact") || key.includes("tel")) {
    field.setAttribute("autocomplete", "tel");
    return;
  }
  if (key.includes("name")) {
    field.setAttribute("autocomplete", "name");
  }
}

function initFormAccessibility() {
  const fields = document.querySelectorAll("form input, form textarea, form select");
  fields.forEach((field) => {
    if (field.classList.contains("hp-field")) return;

    applyAutocompleteHint(field);

    if (field.willValidate) {
      field.addEventListener("blur", () => {
        setFieldValidityState(field);
      });

      field.addEventListener("input", () => {
        if (field.getAttribute("aria-invalid") === "true") {
          setFieldValidityState(field);
        }
      });
    }
  });
}

function initSupportForms() {
  const forms = document.querySelectorAll("form.support-form");
  forms.forEach((form) => {
    const statusEl = form.querySelector(".form-status");
    form.setAttribute("data-started-at", String(Date.now()));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        const firstInvalid = form.querySelector(":invalid");
        if (firstInvalid) {
          setFieldValidityState(firstInvalid);
          firstInvalid.focus();
        }
        setStatusMessage(statusEl, "Please complete all required fields and try again.", "error");
        form.reportValidity();
        return;
      }

      const payload = serializeForm(form);
      const formName = form.getAttribute("data-form-name") || "Support Request";
      const endpoint = getFormEndpoint(form);
      const endpointConfigured = isLiveEndpoint(endpoint);

      if (payload.company) {
        setStatusMessage(statusEl, "Submission blocked.", "error");
        emitTelemetry("form_blocked_honeypot", { formName });
        return;
      }
      delete payload.company;

      const startedAt = Number(form.getAttribute("data-started-at") || "0");
      if (startedAt && Date.now() - startedAt < 2500) {
        setStatusMessage(statusEl, "Please review your information and try again.", "error");
        emitTelemetry("form_blocked_fast_submit", { formName });
        return;
      }

      if (isRateLimited(formName)) {
        setStatusMessage(statusEl, "Please wait a moment before submitting again.", "error");
        emitTelemetry("form_blocked_rate_limit", { formName });
        return;
      }

      setSubmittingState(form, true);

      try {
        const sheetsPayload = buildGoogleSheetsPayload(form, payload);

        if (endpointConfigured) {
          if (sheetsPayload) {
            await submitPayload(endpoint, sheetsPayload);
          } else {
            await submitPayload(endpoint, {
              formName,
              submitted_at: new Date().toISOString(),
              ...payload,
            });
          }
          setStatusMessage(statusEl, "Thanks. Your request was submitted successfully.", "success");
          emitTelemetry("form_submit_success", { formName, endpointConfigured: true });
        } else {
          setStatusMessage(
            statusEl,
            "Thanks. Your request was captured locally. Replace APPS_SCRIPT_WEB_APP_URL with your deployed Apps Script URL to enable live submission.",
            "info"
          );
          emitTelemetry("form_submit_local_capture", { formName, endpointConfigured: false });
        }
        form.reset();
        clearFormValidityStates(form);
        form.setAttribute("data-started-at", String(Date.now()));
      } catch (error) {
        setStatusMessage(statusEl, "We could not submit right now. Please try again shortly.", "error");
        emitTelemetry("form_submit_error", { formName, message: String(error) });
        console.error("Form submission error:", error);
      } finally {
        setSubmittingState(form, false);
      }
    });
  });
}

function initInsiderForms() {
  const forms = document.querySelectorAll("form.insider-form");
  forms.forEach((form) => {
    const statusEl = form.querySelector(".insider-status");
    const email = form.querySelector("input[type='email']");
    if (email) applyAutocompleteHint(email);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!email || !email.value.trim() || !email.checkValidity()) {
        if (email) {
          setFieldValidityState(email);
          email.focus();
          email.reportValidity();
        }
        setStatusMessage(statusEl, "Please enter an email address.", "error");
        return;
      }
      email.setAttribute("aria-invalid", "false");
      setStatusMessage(statusEl, "Thanks for signing up. You are on the insider list.", "success");
      emitTelemetry("insider_signup", { location: window.location.pathname });
      form.reset();
    });
  });
}

function initTrackedInteractions() {
  const tracked = document.querySelectorAll("[data-track]");
  tracked.forEach((el) => {
    el.addEventListener("click", () => {
      const trackId = el.getAttribute("data-track");
      if (!trackId) return;
      emitTelemetry("tracked_interaction", { trackId });
    });
  });
}

function buildMailtoHref(subject, body) {
  return `mailto:info@tonightweride.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function isHomepageView() {
  if (document.body?.classList.contains("page-home")) return true;
  const path = (window.location.pathname || "").toLowerCase();
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  return lastSegment === "" || lastSegment === "index.html";
}

function initFoundingMemberSection() {
  const section = document.querySelector(".founding-member-section");
  if (!section) return;

  const cards = Array.from(section.querySelectorAll(".founding-tier-card"));
  const frequencyInputs = Array.from(section.querySelectorAll("input[name='founding-frequency']"));
  const selectionEl = section.querySelector("[data-founding-selection]");
  const cta = section.querySelector("[data-founding-cta]");

  if (!cards.length || !frequencyInputs.length || !selectionEl || !cta) return;

  const getFrequency = () => {
    const checked = frequencyInputs.find((input) => input.checked);
    return checked ? checked.value : "monthly";
  };

  const getSelectedCard = () => cards.find((card) => card.classList.contains("is-selected")) || cards[0];

  const updateCardDisplays = () => {
    const frequency = getFrequency();
    cards.forEach((card) => {
      const display = card.querySelector("[data-amount-display]");
      if (!display) return;
      const amount = card.dataset[frequency === "monthly" ? "monthlyAmount" : "oneTimeAmount"] || "";
      display.textContent = amount;
    });
  };

  const updateSelection = () => {
    const frequency = getFrequency();
    const selectedCard = getSelectedCard();
    const tier = selectedCard.dataset.tier || "Founding Member";
    const amount = selectedCard.dataset[frequency === "monthly" ? "monthlyAmount" : "oneTimeAmount"] || "";
    const cadenceLabel = frequency === "monthly" ? "monthly recurring donation" : "one-time donation";
    const subject = `Founding Member - ${tier} ${frequency === "monthly" ? "Monthly" : "One-Time"}`;
    const body = `I want to join Tonight We Ride as a ${tier} Founding Member with a ${cadenceLabel} of ${amount}.`;

    selectionEl.textContent = `Selected: ${tier}, ${cadenceLabel}, ${amount}`;
    cta.href = buildMailtoHref(subject, body);
    cta.textContent = frequency === "monthly" ? "Become a Founding Member" : "Support Tonight We Ride";

    cards.forEach((card) => {
      const btn = card.querySelector(".founding-tier-select");
      const isSelected = card === selectedCard;
      card.classList.toggle("is-selected", isSelected);
      if (btn) {
        btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        btn.textContent = isSelected ? `${card.dataset.tier} Selected` : `Choose ${card.dataset.tier}`;
      }
    });

    updateCardDisplays();
  };

  cards.forEach((card) => {
    const btn = card.querySelector(".founding-tier-select");
    const selectCard = () => {
      cards.forEach((item) => item.classList.remove("is-selected"));
      card.classList.add("is-selected");
      updateSelection();
    };

    card.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("a")) return;
      selectCard();
    });

    if (btn) {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        selectCard();
      });
    }
  });

  frequencyInputs.forEach((input) => {
    input.addEventListener("change", updateSelection);
  });

  updateSelection();
}

function initFoundingMemberPromo() {
  const existingPromo = document.querySelector(".founding-promo");
  if (existingPromo) return;

  const isHomepage = isHomepageView();
  if (!isHomepage) return;

  // Built in JS so the promotion is managed in one place and only appears on homepage.
  const promo = document.createElement("aside");
  promo.className = "founding-promo";
  promo.setAttribute("role", "dialog");
  promo.setAttribute("aria-labelledby", "founding-promo-title");
  promo.setAttribute("aria-describedby", "founding-promo-copy");

  promo.innerHTML = `
    <button type="button" class="founding-promo-dismiss" aria-label="Dismiss Founding Member promotion">Close</button>
    <p class="founding-promo-kicker">Limited Promotion</p>
    <h2 id="founding-promo-title">Become a Founding Member</h2>
    <p id="founding-promo-copy">
      Join a core group of supporters helping Tonight We Ride build lasting outreach impact and receive VIP event status.
    </p>
    <a class="founding-promo-cta" href="donate-now.html#founding-member" data-track="founding-promo-cta">
      Join as a Founding Member
    </a>
  `;

  document.body.appendChild(promo);

  const dismissBtn = promo.querySelector(".founding-promo-dismiss");
  const cta = promo.querySelector(".founding-promo-cta");
  let closeTimer = null;
  const onKeydown = (event) => {
    if (event.key === "Escape" && promo.isConnected) {
      closePromo("escape");
    }
  };

  const closePromo = (reason) => {
    if (!promo.isConnected) return;
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    document.removeEventListener("keydown", onKeydown);
    promo.classList.remove("is-visible");
    emitTelemetry("founding_promo_closed", { reason });
    window.setTimeout(() => {
      promo.remove();
    }, 220);
  };

  dismissBtn?.addEventListener("click", () => closePromo("dismiss"));
  cta?.addEventListener("click", () => closePromo("cta"));
  document.addEventListener("keydown", onKeydown);

  window.setTimeout(() => {
    promo.classList.add("is-visible");
    emitTelemetry("founding_promo_shown", { path: window.location.pathname });
  }, 300);

  closeTimer = window.setTimeout(() => {
    closePromo("timeout");
  }, 12000);
}

function initMailingListThirdPagePopup() {
  const countKey = "twr_page_visit_count";
  const shownKey = "twr_mailing_popup_shown";

  try {
    const previousCount = Number(sessionStorage.getItem(countKey) || "0");
    const nextCount = previousCount + 1;

    sessionStorage.setItem(countKey, String(nextCount));

    if (sessionStorage.getItem(shownKey) === "true" || nextCount < 3) return;
    sessionStorage.setItem(shownKey, "true");
  } catch (error) {
    // If storage is blocked we skip popup behavior.
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "mailing-popup-overlay";
  overlay.setAttribute("role", "presentation");
  overlay.innerHTML = `
    <aside class="mailing-popup" role="dialog" aria-modal="true" aria-labelledby="mailing-popup-title" aria-describedby="mailing-popup-copy">
      <button type="button" class="mailing-popup-dismiss" aria-label="Close mailing list popup">Close</button>
      <p class="mailing-popup-kicker">Stay Connected</p>
      <h2 id="mailing-popup-title">Join Our Mailing List</h2>
      <p id="mailing-popup-copy">Get outreach updates, event announcements, and ways to support Tonight We Ride.</p>
      <a class="mailing-popup-cta" href="index.html#insider" data-track="mailing-popup-cta">Join the Mailing List</a>
    </aside>
  `;

  const close = (reason) => {
    if (!overlay.isConnected) return;
    overlay.classList.remove("is-visible");
    emitTelemetry("mailing_popup_closed", { reason });
    window.setTimeout(() => {
      overlay.remove();
    }, 180);
    document.removeEventListener("keydown", onKeydown);
  };

  const onKeydown = (event) => {
    if (event.key === "Escape") close("escape");
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close("backdrop");
  });

  overlay.querySelector(".mailing-popup-dismiss")?.addEventListener("click", () => close("dismiss"));
  overlay.querySelector(".mailing-popup-cta")?.addEventListener("click", () => close("cta"));

  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeydown);
  window.requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
  });
  emitTelemetry("mailing_popup_shown", { path: window.location.pathname });
}

function initMobileNav() {
  const headers = document.querySelectorAll(".site-header");
  headers.forEach((header, idx) => {
    const nav = header.querySelector(".site-nav");
    if (!nav) return;

    const navId = nav.id || `primary-nav-${idx + 1}`;
    nav.id = navId;

    if (header.querySelector(".nav-toggle")) return;
    header.classList.add("nav-enhanced");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", navId);
    toggle.setAttribute("aria-label", "Open navigation");
    toggle.innerHTML = "<span></span><span></span><span></span>";

    const brand = header.querySelector(".brand");
    if (brand && brand.nextSibling) {
      brand.insertAdjacentElement("afterend", toggle);
    } else {
      header.querySelector(".header-inner")?.prepend(toggle);
    }

    const closeNav = () => {
      header.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
    };

    toggle.addEventListener("click", () => {
      const opening = !header.classList.contains("nav-open");
      header.classList.toggle("nav-open", opening);
      toggle.setAttribute("aria-expanded", opening ? "true" : "false");
      toggle.setAttribute("aria-label", opening ? "Close navigation" : "Open navigation");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNav);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) {
        closeNav();
      }
    });
  });
}

function initAboutNavDropdown() {
  const navs = document.querySelectorAll(".site-nav");
  navs.forEach((nav) => {
    if (nav.querySelector(".nav-dropdown")) return;

    const aboutLink = nav.querySelector("a[href='about.html']");
    if (!aboutLink) return;

    const dropdown = document.createElement("div");
    dropdown.className = "nav-dropdown";

    aboutLink.classList.add("nav-dropdown-trigger");
    aboutLink.insertAdjacentElement("beforebegin", dropdown);
    dropdown.appendChild(aboutLink);

    const submenu = document.createElement("div");
    submenu.className = "nav-submenu";
    submenu.setAttribute("role", "menu");

    const aboutPageLink = document.createElement("a");
    aboutPageLink.href = "about.html";
    aboutPageLink.textContent = "About";
    aboutPageLink.setAttribute("role", "menuitem");
    aboutPageLink.setAttribute("data-track", "nav-about-page");

    const teamLink = document.createElement("a");
    teamLink.href = "team.html";
    teamLink.textContent = "Meet the Board";
    teamLink.setAttribute("role", "menuitem");
    teamLink.setAttribute("data-track", "nav-about-meet-the-board");

    submenu.appendChild(aboutPageLink);
    submenu.appendChild(teamLink);
    dropdown.appendChild(submenu);
  });
}

function initImagePerformanceDefaults() {
  const images = document.querySelectorAll("img");
  images.forEach((img) => {
    const insideHero = Boolean(img.closest(".hero-media"));
    if (!insideHero && !img.hasAttribute("loading")) {
      img.setAttribute("loading", "lazy");
    }
    if (!img.hasAttribute("fetchpriority")) {
      img.setAttribute("fetchpriority", insideHero ? "high" : "low");
    }
    if (!img.hasAttribute("decoding")) {
      img.setAttribute("decoding", "async");
    }
    if (img.closest(".events-gallery-grid") && !img.hasAttribute("sizes")) {
      img.setAttribute("sizes", "(max-width: 520px) 100vw, (max-width: 780px) 50vw, (max-width: 1180px) 33vw, 220px");
    }
  });

  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((frame) => {
    if (!frame.hasAttribute("loading")) {
      frame.setAttribute("loading", "lazy");
    }
  });
}

function initRevealOnScroll() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const targets = document.querySelectorAll(
    ".program-card, .resource-card, .event-card, .donate-tier, .support-form, .block-panel, .cream-block, .footer-col, .founding-member-card, .founding-tier-card, .founding-benefits, .news-card, .about-team-card, .poster-card, .toy-dropoff-gallery-item, .partner-logo-grid a, .insider-form-shell"
  );
  if (!targets.length) return;

  const perParentCounters = new Map();
  targets.forEach((el) => {
    el.classList.add("reveal-item");

    const parent = el.parentElement;
    if (!parent) return;
    const index = perParentCounters.get(parent) || 0;
    el.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 70}ms`);
    perParentCounters.set(parent, index + 1);
  });

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  targets.forEach((el) => observer.observe(el));
}

function initMotionReadyState() {
  const body = document.body;
  if (!body) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    body.classList.add("motion-ready");
    return;
  }

  body.classList.add("motion-pending");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      body.classList.add("motion-ready");
    });
  });
}

function initHomelessHeroVideoFade() {
  const hero = document.querySelector(".page-homeless .homeless-video-hero");
  const media = hero?.querySelector(".homeless-hero-media");
  const frame = hero?.querySelector(".homeless-hero-video-frame");
  if (!hero || !media || !frame) return;

  let hasActivated = false;
  const activateFade = (reason) => {
    if (hasActivated) return;
    hasActivated = true;
    hero.classList.add("is-video-playing");
    emitTelemetry("homeless_hero_video_interaction", { reason });
  };

  media.addEventListener("pointerdown", () => activateFade("pointerdown"), { passive: true });
  media.addEventListener("touchstart", () => activateFade("touchstart"), { passive: true });
  frame.addEventListener("focus", () => activateFade("focus"));

  window.addEventListener("blur", () => {
    if (document.activeElement === frame) {
      activateFade("frame_focus_blur");
    }
  });

  // Some embedded players emit postMessage play state updates.
  window.addEventListener("message", (event) => {
    if (hasActivated) return;
    if (typeof event.origin !== "string" || !event.origin.includes("facebook.com")) return;

    const payload = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    if (/play|started|video/i.test(payload)) {
      activateFade("postmessage");
    }
  });
}

function initHomelessSupportFormToggle() {
  const form = document.querySelector(".page-homeless form.support-form");
  if (!form) return;

  const intentInputs = Array.from(form.querySelectorAll("input[data-ho-intent]"));
  const requestLabel = form.querySelector("[data-ho-request-label]");
  const submitBtn = form.querySelector("[data-ho-submit-text]");
  const formNote = form.querySelector("[data-ho-form-note]");
  const requestField = form.querySelector("#ho-request");
  if (!intentInputs.length || !requestLabel || !submitBtn || !formNote || !requestField) return;

  const updateState = () => {
    const checked = intentInputs.find((input) => input.checked);
    const intent = checked ? checked.value : "Request Support";
    const isVolunteer = intent.toLowerCase() === "volunteer";

    form.setAttribute(
      "data-form-name",
      isVolunteer ? "Homeless Outreach Volunteer" : "Homeless Outreach Request Support"
    );
    requestLabel.textContent = isVolunteer ? "How would you like to volunteer?" : "How can we help?";
    submitBtn.textContent = isVolunteer ? "Volunteer with Tonight We Ride" : "Request Support";
    formNote.textContent = isVolunteer
      ? "Thanks for volunteering. We'll follow up with outreach details."
      : "Response goal: within 48 hours.";
    requestField.placeholder = isVolunteer
      ? "Share your availability, skills, or preferred way to help."
      : "Share details so our team can respond with appropriate support.";
  };

  intentInputs.forEach((input) => {
    input.addEventListener("change", updateState);
  });

  updateState();
}

function initHomelessMailerLiteToggle() {
  const root = document.querySelector(".page-homeless [data-ho-ml-toggle]");
  if (!root) return;

  const intentInputs = Array.from(root.querySelectorAll("input[data-ho-ml-intent]"));
  const panels = Array.from(root.querySelectorAll("[data-ho-ml-panel]"));
  if (!intentInputs.length || !panels.length) return;

  const updateState = () => {
    const checked = intentInputs.find((input) => input.checked) || intentInputs[0];
    const selected = checked ? checked.value : "support";

    panels.forEach((panel) => {
      const isActive = panel.getAttribute("data-ho-ml-panel") === selected;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });
  };

  intentInputs.forEach((input) => {
    input.addEventListener("change", updateState);
  });

  updateState();
}

document.addEventListener("DOMContentLoaded", () => {
  initMotionReadyState();
  initFoundingMemberPromo();
  initMailingListThirdPagePopup();
  initAboutNavDropdown();
  initMobileNav();
  initImagePerformanceDefaults();
  initHomelessHeroVideoFade();
  initHomelessSupportFormToggle();
  initHomelessMailerLiteToggle();
  initFormAccessibility();
  initFoundingMemberSection();
  initSupportForms();
  initInsiderForms();
  initTrackedInteractions();
});
