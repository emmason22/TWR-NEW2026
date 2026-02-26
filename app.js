function serializeForm(form) {
  const data = new FormData(form);
  const out = {};
  for (const [key, value] of data.entries()) {
    out[key] = String(value).trim();
  }
  return out;
}

function getFormEndpoint(form) {
  const formEndpoint = form.getAttribute("data-endpoint");
  if (formEndpoint) return formEndpoint;

  const meta = document.querySelector("meta[name='twr-form-endpoint']");
  if (meta && meta.content) return meta.content.trim();

  return "";
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

function initSupportForms() {
  const forms = document.querySelectorAll("form.support-form");
  forms.forEach((form) => {
    const statusEl = form.querySelector(".form-status");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const payload = serializeForm(form);
      const formName = form.getAttribute("data-form-name") || "Support Request";
      const endpoint = getFormEndpoint(form);

      if (payload.company) {
        if (statusEl) statusEl.textContent = "Submission blocked.";
        return;
      }

      setSubmittingState(form, true);

      try {
        if (endpoint) {
          await submitPayload(endpoint, formName, payload);
          if (statusEl) statusEl.textContent = "Thanks. Your request was submitted successfully.";
        } else {
          if (statusEl) {
            statusEl.textContent = "Thanks. Your request was captured locally. Add your endpoint in the page meta tag to enable live submission.";
          }
          console.info("Form submission captured (no endpoint configured):", { formName, payload });
        }
        form.reset();
      } catch (error) {
        if (statusEl) {
          statusEl.textContent = "We could not submit right now. Please try again shortly.";
        }
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
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = form.querySelector("input[type='email']");
      if (!email || !email.value.trim()) {
        if (statusEl) statusEl.textContent = "Please enter an email address.";
        return;
      }
      if (statusEl) statusEl.textContent = "Thanks for signing up. You are on the insider list.";
      console.info("Insider signup captured:", { email: email.value.trim() });
      form.reset();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSupportForms();
  initInsiderForms();
});
