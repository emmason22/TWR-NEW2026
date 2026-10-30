// Toy Drive page interactions
(function initGoogleAnalytics() {
  const measurementId = "G-S2WZ0N6HV8";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId);

  const googleTag = document.createElement("script");
  googleTag.async = true;
  googleTag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(googleTag);
})();

(function () {
  const header = document.querySelector(".site-header");
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("toyDriveNav");
  const mobileQuery = window.matchMedia("(max-width: 980px)");

  if (header && navToggle && nav) {
    const closeNav = function () {
      header.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    };

    navToggle.addEventListener("click", function () {
      const isOpen = header.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (mobileQuery.matches) {
          closeNav();
        }
      });
    });

    window.addEventListener("resize", function () {
      if (!mobileQuery.matches) {
        closeNav();
      }
    });
  }

  // Smooth-scroll only for same-page anchors.
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (event) {
      const href = this.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const countdown = document.querySelector("[data-event-countdown]");

  if (countdown) {
    const eventTime = new Date(countdown.dataset.eventDate).getTime();
    const days = countdown.querySelector("[data-countdown-days]");
    const hours = countdown.querySelector("[data-countdown-hours]");
    const minutes = countdown.querySelector("[data-countdown-minutes]");
    const seconds = countdown.querySelector("[data-countdown-seconds]");
    const status = countdown.querySelector("[data-countdown-status]");
    let countdownTimer;

    const setValue = function (element, value) {
      if (element) element.textContent = String(value).padStart(2, "0");
    };

    const updateCountdown = function () {
      const remaining = eventTime - Date.now();

      if (!Number.isFinite(eventTime) || remaining <= 0) {
        setValue(days, 0);
        setValue(hours, 0);
        setValue(minutes, 0);
        setValue(seconds, 0);
        if (status) status.textContent = "The 27th Annual Toy Drive has begun.";
        if (countdownTimer) window.clearInterval(countdownTimer);
        return;
      }

      const totalSeconds = Math.floor(remaining / 1000);
      setValue(days, Math.floor(totalSeconds / 86400));
      setValue(hours, Math.floor((totalSeconds % 86400) / 3600));
      setValue(minutes, Math.floor((totalSeconds % 3600) / 60));
      setValue(seconds, totalSeconds % 60);
    };

    updateCountdown();
    if (Number.isFinite(eventTime) && eventTime > Date.now()) {
      countdownTimer = window.setInterval(updateCountdown, 1000);
    }
  }

  const copyStatus = document.getElementById("copyStatus");

  const fallbackCopy = function (value) {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    return copied;
  };

  document.querySelectorAll("[data-copy-value]").forEach(function (button) {
    button.addEventListener("click", async function () {
      const value = button.dataset.copyValue;
      const label = button.dataset.copyLabel || "Donation information";
      const action = button.querySelector(".qr-copy-action");
      const defaultAction = action ? action.textContent : "Copy";
      let copied = false;

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
          copied = true;
        } else {
          copied = fallbackCopy(value);
        }
      } catch (error) {
        copied = fallbackCopy(value);
      }

      if (copied) {
        button.classList.add("is-copied");
        if (action) action.textContent = "Copied";
        if (copyStatus) copyStatus.textContent = label + " copied: " + value;

        window.setTimeout(function () {
          button.classList.remove("is-copied");
          if (action) action.textContent = defaultAction;
          if (copyStatus) copyStatus.textContent = "";
        }, 3500);
      } else if (copyStatus) {
        copyStatus.textContent = "Copy failed. Use " + value + ".";
      }
    });
  });
})();
