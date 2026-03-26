// Toy Drive page interactions
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
})();
