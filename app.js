const APPS_SCRIPT_WEB_APP_URL = "APPS_SCRIPT_WEB_APP_URL";
const FORM_RETURN_DELAY_MS = 10 * 1000;

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

function isNarrowViewport() {
  return window.matchMedia("(max-width: 680px)").matches;
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

function clearStatusMessage(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = "";
  statusEl.removeAttribute("data-state");
  statusEl.classList.remove("status-burst");
}

function scheduleFormReturn(form, statusEl) {
  if (!form) return;
  const existingTimer = form.getAttribute("data-return-timer");
  if (existingTimer) {
    window.clearTimeout(Number(existingTimer));
  }

  const timer = window.setTimeout(() => {
    form.reset();
    clearFormValidityStates(form);
    clearStatusMessage(statusEl);
    form.setAttribute("data-started-at", String(Date.now()));
    form.removeAttribute("data-return-timer");
  }, FORM_RETURN_DELAY_MS);

  form.setAttribute("data-return-timer", String(timer));
}

async function submitPayload(endpoint, payload) {
  try {
    return await submitPayloadJson(endpoint, payload);
  } catch (postError) {
    // Some Apps Script deployments redirect POST to a GET-only URL.
    if (!shouldTryGetFallback(postError)) {
      throw postError;
    }
    return await submitPayloadQuery(endpoint, payload);
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

  return parsed;
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

  if (tab === "Newsletter") {
    return {
      tab,
      submitted_at: submittedAt,
      status: "new",
      name: payload.name || [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "",
      email: payload.email || "",
      phone: payload.phone || "",
      email_opt_in: "yes",
      source: payload.source || "standalone_form",
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
      const successMessage = form.getAttribute("data-success-message") || "Thanks. Your request was submitted successfully.";

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
          setStatusMessage(statusEl, successMessage, "success");
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
        scheduleFormReturn(form, statusEl);
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
      scheduleFormReturn(form, statusEl);
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

function initExpiringSections() {
  const expiringSections = document.querySelectorAll("[data-expires-at]");
  expiringSections.forEach((section) => {
    const expiresAt = new Date(section.getAttribute("data-expires-at") || "");
    if (!Number.isNaN(expiresAt.getTime()) && Date.now() >= expiresAt.getTime()) {
      section.hidden = true;
    }
  });
}

function incrementSessionVisitCount(key) {
  try {
    const previousCount = Number(sessionStorage.getItem(key) || "0");
    const nextCount = previousCount + 1;
    sessionStorage.setItem(key, String(nextCount));
    return nextCount;
  } catch (error) {
    return 1;
  }
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

  const visitNumber = incrementSessionVisitCount("twr_homepage_visit_count");
  const shouldShowPromo = visitNumber === 1 || visitNumber === 6;
  if (!shouldShowPromo) return;

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
    <a class="founding-promo-cta" href="founding-member.html" data-track="founding-promo-cta">
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
      document.dispatchEvent(
        new CustomEvent("twr:founding-promo-closed", {
          detail: { reason },
        })
      );
    }, 220);
  };

  dismissBtn?.addEventListener("click", () => closePromo("dismiss"));
  cta?.addEventListener("click", () => closePromo("cta"));
  document.addEventListener("keydown", onKeydown);

  const showDelayMs = isNarrowViewport() ? 1200 : 300;
  const closeDelayMs = isNarrowViewport() ? 8000 : 12000;

  window.setTimeout(() => {
    promo.classList.add("is-visible");
    emitTelemetry("founding_promo_shown", {
      path: window.location.pathname,
      visitNumber,
    });
  }, showDelayMs);

  closeTimer = window.setTimeout(() => {
    closePromo("timeout");
  }, closeDelayMs);
}

function showMailingListPopup(options = {}) {
  const {
    side = "center",
    autoCloseMs = 0,
    shownEvent = "mailing_popup_shown",
    closedEvent = "mailing_popup_closed",
  } = options;

  if (document.querySelector(".mailing-popup-overlay")) return null;
  const overlay = document.createElement("div");
  overlay.className = "mailing-popup-overlay";
  if (side === "opposite") {
    overlay.classList.add("is-opposite-side");
  }
  overlay.setAttribute("role", "presentation");
  overlay.innerHTML = `
    <aside class="mailing-popup" role="dialog" aria-modal="true" aria-labelledby="mailing-popup-title" aria-describedby="mailing-popup-copy">
      <button type="button" class="mailing-popup-dismiss" aria-label="Close mailing list popup">Close</button>
      <img class="mailing-popup-logo" src="assets/TonightWeRideLogo.png" alt="Tonight We Ride logo" loading="lazy" decoding="async" />
      <p class="mailing-popup-kicker">Stay Connected</p>
      <h2 id="mailing-popup-title">Join Our Mailing List</h2>
      <p id="mailing-popup-copy">Get outreach updates, event announcements, and ways to support Tonight We Ride.</p>
      <p class="mailing-popup-privacy">No spam. Unsubscribe anytime.</p>
      <form class="mailing-popup-form" novalidate>
        <label class="sr-only" for="mailing-popup-email">Email address</label>
        <div class="mailing-popup-fields">
          <input id="mailing-popup-email" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="Enter your email" />
          <button type="submit" class="mailing-popup-cta">Join the Mailing List</button>
        </div>
        <ul class="mailing-popup-benefits" aria-label="Newsletter benefits">
          <li>See the impact of your donations in action.</li>
          <li>Get alerted to upcoming events and volunteer opportunities.</li>
        </ul>
        <p class="mailing-popup-status" role="status" aria-live="polite"></p>
      </form>
    </aside>
  `;

  let autoCloseTimer = null;
  let isSubmitting = false;
  const close = (reason) => {
    if (!overlay.isConnected) return;
    if (isSubmitting) return;
    if (autoCloseTimer) {
      window.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    overlay.classList.remove("is-visible");
    emitTelemetry(closedEvent, { reason, side });
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

  const dismissBtn = overlay.querySelector(".mailing-popup-dismiss");
  const popupForm = overlay.querySelector(".mailing-popup-form");
  const emailInput = overlay.querySelector("#mailing-popup-email");
  const submitBtn = popupForm?.querySelector("button[type='submit']");
  const statusEl = popupForm?.querySelector(".mailing-popup-status");

  const setPopupStatus = (message, state = "info") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.setAttribute("data-state", state);
  };

  const setPopupSubmitting = (submitting) => {
    isSubmitting = submitting;
    if (submitBtn) {
      submitBtn.disabled = submitting;
      submitBtn.setAttribute("aria-busy", submitting ? "true" : "false");
    }
  };

  dismissBtn?.addEventListener("click", () => close("dismiss"));

  popupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailInput || isSubmitting) return;

    const email = String(emailInput.value || "").trim();
    if (!email || !emailInput.checkValidity()) {
      emailInput.setAttribute("aria-invalid", "true");
      emailInput.focus();
      setPopupStatus("Enter a valid email address to continue.", "error");
      emitTelemetry("mailing_popup_submit_invalid", { path: window.location.pathname });
      return;
    }

    emailInput.setAttribute("aria-invalid", "false");
    setPopupSubmitting(true);
    setPopupStatus("Submitting...", "info");
    emitTelemetry("mailing_popup_submit_attempt", {
      path: window.location.pathname,
      side,
    });

    const endpoint = getMetaContent("twr-form-endpoint");
    const endpointConfigured = isLiveEndpoint(endpoint);

    try {
      if (endpointConfigured) {
        const submission = await submitPayload(endpoint, {
          tab: "Newsletter",
          submitted_at: new Date().toISOString(),
          status: "new",
          name: "",
          email,
          email_opt_in: "yes",
          source: "exit_popup",
          mailerlite_group: "Newsletter",
          mailerlite_status: "pending",
        });
        if (submission?.mailerlite_status === "skipped") {
          setPopupStatus(
            "Thanks. Your interest was captured, but newsletter sync is not configured yet.",
            "info"
          );
          emitTelemetry("mailing_popup_submit_local_capture", {
            path: window.location.pathname,
            endpointConfigured: true,
            mailerliteStatus: "skipped",
          });
        } else {
          setPopupStatus("Thanks. You are signed up for updates.", "success");
          emitTelemetry("mailing_popup_submit_success", {
            path: window.location.pathname,
            endpointConfigured: true,
          });
        }
      } else {
        setPopupStatus(
          "Thanks. We captured your interest. Add your Apps Script endpoint to enable live newsletter signup.",
          "info"
        );
        emitTelemetry("mailing_popup_submit_local_capture", {
          path: window.location.pathname,
          endpointConfigured: false,
        });
      }

      window.setTimeout(() => {
        setPopupSubmitting(false);
        close("submit_success");
      }, 700);
    } catch (error) {
      setPopupSubmitting(false);
      setPopupStatus("Could not submit right now. Please try again in a moment.", "error");
      emitTelemetry("mailing_popup_submit_error", {
        path: window.location.pathname,
        message: String(error),
      });
    }
  });

  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeydown);
  window.requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
  });
  emitTelemetry(shownEvent, { path: window.location.pathname, side });

  if (autoCloseMs > 0) {
    autoCloseTimer = window.setTimeout(() => {
      close("timeout");
    }, autoCloseMs);
  }

  return overlay;
}

function initMailingListExitIntentPopup() {
  const pathname = window.location.pathname || "";
  if (getMetaContent("twr-disable-popups") === "true") {
    emitTelemetry("mailing_popup_exit_intent_skipped", {
      path: pathname,
      reason: "page_disabled",
    });
    return;
  }

  const highIntentPage = /\/(donate-now|founding-member)\.html$/i.test(pathname);
  const shownKey = "twr_exit_intent_popup_shown";

  if (isNarrowViewport()) {
    emitTelemetry("mailing_popup_exit_intent_skipped", {
      path: pathname,
      reason: "narrow_viewport",
    });
    return;
  }

  if (highIntentPage) {
    emitTelemetry("mailing_popup_exit_intent_skipped", {
      path: pathname,
      reason: "high_intent_page",
    });
    return;
  }

  try {
    if (sessionStorage.getItem(shownKey) === "true") {
      emitTelemetry("mailing_popup_exit_intent_skipped", {
        path: pathname,
        reason: "already_shown_this_session",
      });
      return;
    }
  } catch (error) {
    emitTelemetry("mailing_popup_exit_intent_skipped", {
      path: pathname,
      reason: "storage_unavailable",
    });
    return;
  }

  let hasTriggered = false;

  const showPopup = () => {
    if (hasTriggered) return;
    hasTriggered = true;

    try {
      sessionStorage.setItem(shownKey, "true");
    } catch (error) {
      // Continue even if storage write fails.
    }

    showMailingListPopup({
      shownEvent: "mailing_popup_exit_intent_shown",
      closedEvent: "mailing_popup_exit_intent_closed",
    });
    emitTelemetry("mailing_popup_exit_intent_triggered", {
      path: pathname,
    });
  };

  const handleMouseOut = (event) => {
    if (hasTriggered) return;
    const related = event.relatedTarget || event.toElement;
    if (related) return;
    if (typeof event.clientY === "number" && event.clientY > 14) return;
    document.removeEventListener("mouseout", handleMouseOut);
    showPopup();
  };

  document.addEventListener("mouseout", handleMouseOut);
  emitTelemetry("mailing_popup_exit_intent_armed", { path: pathname });
}

function initMobileNav() {
  const headers = document.querySelectorAll(".site-header");
  headers.forEach((header, idx) => {
    const nav = header.querySelector(".site-nav");
    if (!nav) return;

    const navId = nav.id || `primary-nav-${idx + 1}`;
    nav.id = navId;

    header.classList.add("nav-enhanced");

    const existingToggle = header.querySelector(".nav-toggle");
    const toggle = existingToggle || document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", navId);
    toggle.setAttribute("aria-label", "Open navigation");
    if (!toggle.querySelector("span")) {
      toggle.innerHTML = "<span></span><span></span><span></span>";
    }

    if (!existingToggle) {
      const brand = header.querySelector(".brand");
      if (brand && brand.nextSibling) {
        brand.insertAdjacentElement("afterend", toggle);
      } else {
        header.querySelector(".header-inner")?.prepend(toggle);
      }
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

    const actions = header.querySelector(".header-actions");
    if (actions && !nav.querySelector(".mobile-nav-actions")) {
      const mobileActions = document.createElement("div");
      mobileActions.className = "mobile-nav-actions";
      actions.querySelectorAll("a").forEach((action) => {
        const clone = action.cloneNode(true);
        clone.addEventListener("click", closeNav);
        mobileActions.appendChild(clone);
      });
      nav.appendChild(mobileActions);
    }

    document.addEventListener("click", (event) => {
      if (!header.classList.contains("nav-open")) return;
      if (!header.contains(event.target)) closeNav();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNav();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) {
        closeNav();
      }
    });
  });
}

function initOutreachNavDropdown() {
  const navs = document.querySelectorAll(".site-nav");
  navs.forEach((nav) => {
    if (nav.querySelector(".nav-dropdown-outreach")) return;

    const outreachLinks = [
      nav.querySelector("a[href='veteran-outreach.html'], a[href='../../veteran-outreach.html']"),
      nav.querySelector("a[href='homeless-outreach.html'], a[href='../../homeless-outreach.html']"),
      nav.querySelector("a[href='crisis-relief.html'], a[href='../../crisis-relief.html']"),
      nav.querySelector("a[href='emergency-relief.html'], a[href='../../emergency-relief.html']")
    ].filter(Boolean);

    if (outreachLinks.length < 4) return;

    const dropdown = document.createElement("div");
    dropdown.className = "nav-dropdown nav-dropdown-outreach";

    const trigger = document.createElement("a");
    trigger.className = "nav-dropdown-trigger";
    trigger.href = outreachLinks[1].getAttribute("href") || "homeless-outreach.html";
    trigger.textContent = "Outreach";
    outreachLinks[0].insertAdjacentElement("beforebegin", dropdown);
    dropdown.appendChild(trigger);

    const submenu = document.createElement("div");
    submenu.className = "nav-submenu";
    submenu.setAttribute("role", "menu");

    outreachLinks.forEach((link) => {
      link.setAttribute("role", "menuitem");
      submenu.appendChild(link);
    });
    dropdown.appendChild(submenu);
  });
}

function initAboutNavDropdown() {
  const navs = document.querySelectorAll(".site-nav");
  navs.forEach((nav) => {
    if (nav.querySelector(".nav-dropdown-about")) return;

    const aboutLink = nav.querySelector("a[href='about.html'], a[href='../../about.html']");
    if (!aboutLink) return;

    const aboutHref = aboutLink.getAttribute("href") || "about.html";
    const prefix = aboutHref.endsWith("about.html") ? aboutHref.slice(0, -10) : "";
    const currentPage = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

    const dropdown = document.createElement("div");
    dropdown.className = "nav-dropdown nav-dropdown-about";
    aboutLink.insertAdjacentElement("beforebegin", dropdown);

    const trigger = aboutLink;
    trigger.classList.add("nav-dropdown-trigger");
    dropdown.appendChild(trigger);

    const submenu = document.createElement("div");
    submenu.className = "nav-submenu";
    submenu.setAttribute("role", "menu");

    [
      ["about.html", "About"],
      ["our-team.html", "Our Team"],
      ["team.html", "Meet the Board"],
    ].forEach(([href, label]) => {
      const link = document.createElement("a");
      link.href = `${prefix}${href}`;
      link.textContent = label;
      link.setAttribute("role", "menuitem");
      if (currentPage === href) {
        link.setAttribute("aria-current", "page");
      }
      submenu.appendChild(link);
    });

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

function initEmbeddedFormLabelOverrides() {
  const configs = [
    {
      rootSelector: ".page-community .support-form",
      buttonText: "Request Help",
      formName: "Need Help Request",
    },
    {
      rootSelector: ".page-crisis .support-form",
      buttonText: "Request Crisis Support",
      formName: "Crisis Relief Request",
    },
  ];

  const applyOverride = (root, config) => {
    let foundTargets = false;
    const submitCandidates = root.querySelectorAll(
      ".ml-form-embedSubmit button, .ml-form-embedSubmit [type='submit'], button[type='submit']"
    );
    submitCandidates.forEach((button) => {
      if (!button) return;
      foundTargets = true;

      const currentText = (button.textContent || "").trim();
      if (currentText !== config.buttonText) {
        button.textContent = config.buttonText;
      }

      if (button.getAttribute("aria-label") !== config.buttonText) {
        button.setAttribute("aria-label", config.buttonText);
      }
    });

    const form = root.querySelector("form");
    if (form && config.formName) {
      foundTargets = true;
      if (form.getAttribute("data-form-name") !== config.formName) {
        form.setAttribute("data-form-name", config.formName);
      }
    }

    return foundTargets;
  };

  configs.forEach((config) => {
    const root = document.querySelector(config.rootSelector);
    if (!root) return;

    if (applyOverride(root, config)) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (applyOverride(root, config)) {
        observer.disconnect();
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    window.setTimeout(() => {
      observer.disconnect();
    }, 10000);
  });
}

function initVolunteerConversionFlow() {
  const roleSection = document.querySelector(".page-volunteer .volunteer-role-section");
  if (!roleSection) return;

  const cards = Array.from(roleSection.querySelectorAll(".volunteer-role-card"));
  const selectionMessage = roleSection.querySelector("[data-volunteer-role-selection]");
  const hiddenRoleField = roleSection.querySelector("#volunteer-role-selection-field");
  const formSection = document.querySelector(".page-volunteer #volunteer-form");
  const formShell = formSection?.querySelector(".volunteer-form-shell");
  const formHeading = formSection?.querySelector("h2");
  if (!cards.length || !formSection || !formShell) return;

  let activeRole = cards.find((card) => card.classList.contains("is-selected"))?.getAttribute("data-role") || "";

  const upsertRoleField = (form, roleValue) => {
    if (!form || !roleValue) return;

    let hidden = form.querySelector("input[name='volunteer_role']");
    if (!hidden) {
      hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "volunteer_role";
      form.appendChild(hidden);
    }
    hidden.value = roleValue;

    const selectTargets = form.querySelectorAll(
      "select[name*='role' i], select[id*='role' i], select[name*='volunteer' i], select[id*='volunteer' i]"
    );
    selectTargets.forEach((select) => {
      const option = Array.from(select.options || []).find((opt) => {
        const text = `${opt.textContent || ""} ${opt.value || ""}`.toLowerCase();
        return text.includes(roleValue.toLowerCase());
      });
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const textTargets = form.querySelectorAll(
      "input[type='text'][name*='role' i], input[type='text'][id*='role' i], textarea[name*='role' i], textarea[id*='role' i]"
    );
    textTargets.forEach((field) => {
      field.value = roleValue;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const syncRoleToForm = (roleValue) => {
    if (!roleValue) return;
    formShell.querySelectorAll("form").forEach((form) => upsertRoleField(form, roleValue));
  };

  const setActiveCard = (roleValue) => {
    activeRole = roleValue;
    cards.forEach((card) => {
      const isActive = card.getAttribute("data-role") === roleValue;
      card.classList.toggle("is-selected", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    if (selectionMessage) {
      selectionMessage.textContent = `Selected pathway: ${roleValue}`;
    }
    if (hiddenRoleField) {
      hiddenRoleField.value = roleValue;
    }
    syncRoleToForm(roleValue);
  };

  const focusVolunteerForm = () => {
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!formHeading) return;
    if (!formHeading.hasAttribute("tabindex")) {
      formHeading.setAttribute("tabindex", "-1");
    }
    window.setTimeout(() => {
      formHeading.focus({ preventScroll: true });
    }, 320);
  };

  cards.forEach((card) => {
    card.setAttribute(
      "aria-pressed",
      card.getAttribute("data-role") === activeRole ? "true" : "false"
    );
    card.addEventListener("click", () => {
      const roleValue = card.getAttribute("data-role") || "";
      if (!roleValue) return;
      setActiveCard(roleValue);
      focusVolunteerForm();
      emitTelemetry("volunteer_role_selected", {
        path: window.location.pathname,
        role: roleValue,
      });
    });
  });

  const formObserver = new MutationObserver(() => {
    syncRoleToForm(activeRole);
  });
  formObserver.observe(formShell, { childList: true, subtree: true });
  window.setTimeout(() => {
    formObserver.disconnect();
  }, 15000);

  if (activeRole) {
    setActiveCard(activeRole);
  } else {
    const defaultRole = cards[0]?.getAttribute("data-role") || "";
    if (defaultRole) {
      setActiveCard(defaultRole);
    }
  }
}

function normalizeVolunteerRole(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return "";

  const roleMap = {
    "homeless outreach": "Homeless Outreach",
    "veteran outreach": "Veteran Outreach",
    "event support": "Event Support",
    "fundraising/donor support": "Fundraising/Donor Support",
    "media/content creation": "Media/Content Creation",
    "general volunteering": "General Volunteering",
    "homeless outreach volunteer": "Homeless Outreach",
    "veteran outreach volunteer": "Veteran Outreach",
    "event volunteer": "Event Support",
    "fundraising volunteer": "Fundraising/Donor Support",
    "donor support": "Fundraising/Donor Support",
    "media volunteer": "Media/Content Creation",
    "content creation": "Media/Content Creation",
    "general volunteer": "General Volunteering",
    "outreach volunteer": "Homeless Outreach",
    "skills volunteer": "Media/Content Creation",
    outreach: "Homeless Outreach",
    event: "Event Support",
    skills: "Media/Content Creation",
    homeless: "Homeless Outreach",
    veteran: "Veteran Outreach",
    fundraising: "Fundraising/Donor Support",
    media: "Media/Content Creation",
    general: "General Volunteering",
  };

  return roleMap[input] || "";
}

function initVolunteerSignupPage() {
  const page = document.querySelector(".page-volunteer-signup");
  if (!page) return;

  const form = page.querySelector("form.support-form");
  if (!form) return;

  const firstNameInput = form.querySelector("input[name='first_name']");
  const lastNameInput = form.querySelector("input[name='last_name']");
  const fullNameInput = form.querySelector("#volunteer-full-name");
  const roleInput = form.querySelector("#volunteer-role-field");
  const requestInput = form.querySelector("#volunteer-request-field");

  const roleFromQuery = normalizeVolunteerRole(new URLSearchParams(window.location.search).get("role"));
  const defaultRole = normalizeVolunteerRole(roleInput?.value) || "Homeless Outreach";
  const selectedRole = roleFromQuery || defaultRole;

  const syncFullName = () => {
    if (!fullNameInput) return;
    const fullName = `${firstNameInput?.value || ""} ${lastNameInput?.value || ""}`
      .replace(/\s+/g, " ")
      .trim();
    fullNameInput.value = fullName;
  };

  if (roleInput) {
    roleInput.value = selectedRole;
  }

  if (requestInput) {
    requestInput.value = `Volunteer pathway interest: ${selectedRole}`;
  }

  firstNameInput?.addEventListener("input", syncFullName);
  lastNameInput?.addEventListener("input", syncFullName);

  form.addEventListener("submit", () => {
    syncFullName();
    if (requestInput && !requestInput.value.trim()) {
      requestInput.value = `Volunteer pathway interest: ${selectedRole}`;
    }
  });

  syncFullName();
}

function initDonateConversionPanel() {
  const panel = document.querySelector(".page-donate .donation-options-panel");
  if (!panel) return;

  const cards = Array.from(panel.querySelectorAll(".donation-choice-card"));
  const customInput = panel.querySelector("#donation-custom-amount");
  const cta = panel.querySelector("#donation-primary-cta");
  if (!cards.length || !customInput || !cta) return;

  let selectedCard = cards.find((card) => card.classList.contains("is-selected")) || cards[0];

  const setCardState = (activeCard) => {
    cards.forEach((card) => {
      const isActive = card === activeCard;
      card.classList.toggle("is-selected", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    selectedCard = activeCard;
  };

  const updateCta = () => {
    const defaultOnceUrl = cta.getAttribute("data-default-once-url") || "";
    const customOnceUrl = cta.getAttribute("data-custom-once-url") || defaultOnceUrl;
    const customValue = Number(customInput.value || "0");
    const hasCustomValue = Number.isFinite(customValue) && customValue > 0;

    if (hasCustomValue) {
      cta.href = customOnceUrl;
      cta.textContent = "Donate Custom Amount";
      panel.classList.add("has-custom-amount");
    } else {
      const selectedUrl = selectedCard?.getAttribute("data-donate-url") || defaultOnceUrl;
      const selectedAmount = selectedCard?.getAttribute("data-amount") || "";
      cta.href = selectedUrl;
      cta.textContent = selectedAmount ? `Donate ${selectedAmount}` : "Donate Now";
      panel.classList.remove("has-custom-amount");
    }

    cta.setAttribute("target", "_blank");
    cta.setAttribute("rel", "noopener noreferrer");
  };

  cards.forEach((card) => {
    card.setAttribute("aria-pressed", card === selectedCard ? "true" : "false");
    card.addEventListener("click", () => {
      setCardState(card);
      if (customInput.value) customInput.value = "";
      updateCta();
      emitTelemetry("donation_option_selected", {
        path: window.location.pathname,
        amount: card.getAttribute("data-amount") || "unknown",
      });
    });
  });

  customInput.addEventListener("input", updateCta);
  updateCta();
}

function initDonationReturnMessage() {
  const statusEl = document.querySelector("[data-donation-return-status]");
  if (!statusEl) return;

  const params = new URLSearchParams(window.location.search);
  const isSuccess = ["success", "donation_success", "checkout_success"].some((key) => {
    const value = String(params.get(key) || "").toLowerCase();
    return value === "1" || value === "true" || value === "yes";
  });

  if (!isSuccess) return;

  setStatusMessage(statusEl, "Thanks for riding with us. Your support helps us answer the next need.", "success");
  window.setTimeout(() => {
    clearStatusMessage(statusEl);
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }, FORM_RETURN_DELAY_MS);
}

function initDonationTicker() {
  const ticker = document.querySelector("[data-donation-ticker]");
  if (!ticker) return;

  const endpoint = getMetaContent("twr-donation-ticker-endpoint");
  const totalEl = ticker.querySelector("[data-donation-ticker-total]");
  const updatedEl = ticker.querySelector("[data-donation-ticker-updated]");
  const emptyEl = ticker.querySelector("[data-donation-ticker-empty]");
  const listEl = ticker.querySelector("[data-donation-ticker-list]");

  const formatCurrency = (amountCents, currency = "usd") => {
    const amount = Number(amountCents || 0) / 100;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: String(currency || "usd").toUpperCase(),
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      }).format(amount);
    } catch (_) {
      return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
  };

  const formatUpdatedAt = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Live tracker updated recently.";
    return `Last updated ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };

  const renderFallback = (message) => {
    if (totalEl) totalEl.textContent = "Total since we went live: --";
    if (updatedEl) updatedEl.textContent = message;
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.replaceChildren();
  };

  const renderTicker = (data) => {
    const currency = data.currency || "usd";
    if (totalEl) totalEl.textContent = `Total since we went live: ${formatCurrency(data.total_cents, currency)}`;
    if (updatedEl) updatedEl.textContent = formatUpdatedAt(data.updated_at);

    const recent = Array.isArray(data.recent) ? data.recent : [];
    if (emptyEl) emptyEl.hidden = true;
    if (!listEl) return;

    const items = recent.slice(0, 8).map((donation) => {
      const item = document.createElement("li");
      item.className = "donation-ticker-item";

      const name = document.createElement("span");
      name.className = "donation-ticker-name";
      name.textContent = `${donation.display_name || "Supporter"} gave`;

      const amount = document.createElement("span");
      amount.className = "donation-ticker-amount";
      amount.textContent = formatCurrency(donation.amount_cents, donation.currency || currency);

      item.append(name, amount);
      return item;
    });

    listEl.replaceChildren(...items);
  };

  if (!endpoint) {
    renderFallback("Live tracker is coming online.");
    return;
  }

  const fetchTicker = async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`Ticker request failed with status ${response.status}`);
      renderTicker(await response.json());
    } catch (error) {
      renderFallback("Live tracker is temporarily unavailable. Donation checkout still works.");
      console.warn("Donation ticker failed:", error);
    }
  };

  fetchTicker();
  window.setInterval(fetchTicker, 30000);
}

document.addEventListener("DOMContentLoaded", () => {
  initMotionReadyState();
  initExpiringSections();
  initFoundingMemberPromo();
  initMailingListExitIntentPopup();
  initAboutNavDropdown();
  initMobileNav();
  initImagePerformanceDefaults();
  initHomelessHeroVideoFade();
  initHomelessSupportFormToggle();
  initHomelessMailerLiteToggle();
  initEmbeddedFormLabelOverrides();
  initVolunteerConversionFlow();
  initVolunteerSignupPage();
  initDonateConversionPanel();
  initDonationReturnMessage();
  initDonationTicker();
  initFormAccessibility();
  initFoundingMemberSection();
  initSupportForms();
  initInsiderForms();
  initTrackedInteractions();
});
