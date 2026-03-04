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

async function submitPayload(endpoint, formName, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      formName,
      payload,
      submittedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Submission failed with status ${response.status}`);
  }
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
        if (statusEl) statusEl.textContent = "Please complete all required fields and try again.";
        form.reportValidity();
        return;
      }

      const payload = serializeForm(form);
      const formName = form.getAttribute("data-form-name") || "Support Request";
      const endpoint = getFormEndpoint(form);

      if (payload.company) {
        if (statusEl) statusEl.textContent = "Submission blocked.";
        emitTelemetry("form_blocked_honeypot", { formName });
        return;
      }

      const startedAt = Number(form.getAttribute("data-started-at") || "0");
      if (startedAt && Date.now() - startedAt < 2500) {
        if (statusEl) statusEl.textContent = "Please review your information and try again.";
        emitTelemetry("form_blocked_fast_submit", { formName });
        return;
      }

      if (isRateLimited(formName)) {
        if (statusEl) statusEl.textContent = "Please wait a moment before submitting again.";
        emitTelemetry("form_blocked_rate_limit", { formName });
        return;
      }

      setSubmittingState(form, true);

      try {
        if (endpoint) {
          await submitPayload(endpoint, formName, payload);
          if (statusEl) statusEl.textContent = "Thanks. Your request was submitted successfully.";
          emitTelemetry("form_submit_success", { formName, endpointConfigured: true });
        } else {
          if (statusEl) {
            statusEl.textContent = "Thanks. Your request was captured locally. Add your endpoint in the page meta tag to enable live submission.";
          }
          emitTelemetry("form_submit_local_capture", { formName, endpointConfigured: false });
        }
        form.reset();
        clearFormValidityStates(form);
        form.setAttribute("data-started-at", String(Date.now()));
      } catch (error) {
        if (statusEl) {
          statusEl.textContent = "We could not submit right now. Please try again shortly.";
        }
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
        if (statusEl) statusEl.textContent = "Please enter an email address.";
        return;
      }
      email.setAttribute("aria-invalid", "false");
      if (statusEl) statusEl.textContent = "Thanks for signing up. You are on the insider list.";
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

function initMobileNav() {
  const headers = document.querySelectorAll(".site-header");
  headers.forEach((header, idx) => {
    const nav = header.querySelector(".site-nav");
    if (!nav) return;

    const navId = nav.id || `primary-nav-${idx + 1}`;
    nav.id = navId;

    if (header.querySelector(".nav-toggle")) return;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", navId);
    toggle.setAttribute("aria-label", "Toggle navigation");
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
    };

    toggle.addEventListener("click", () => {
      const opening = !header.classList.contains("nav-open");
      header.classList.toggle("nav-open", opening);
      toggle.setAttribute("aria-expanded", opening ? "true" : "false");
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
    ".program-card, .resource-card, .event-card, .donate-tier, .support-form, .block-panel, .cream-block, .footer-col"
  );
  if (!targets.length) return;

  targets.forEach((el) => el.classList.add("reveal-item"));

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

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initImagePerformanceDefaults();
  initFormAccessibility();
  initSupportForms();
  initInsiderForms();
  initTrackedInteractions();
});
