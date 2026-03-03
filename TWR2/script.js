(() => {
  // Footer year
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Dropdowns (desktop)
  const navGroups = Array.from(document.querySelectorAll(".navGroup"));
  const closeAll = () => navGroups.forEach(g => {
    g.classList.remove("open");
    const btn = g.querySelector(".navBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  });

  navGroups.forEach(group => {
    const btn = group.querySelector(".navBtn");
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = group.classList.contains("open");
      closeAll();
      if (!isOpen) {
        group.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAll();
      closeDrawer();
    }
  });

  // Drawer
  const openBtn = document.getElementById("openDrawer");
  const closeBtn = document.getElementById("closeDrawer");
  const drawer = document.getElementById("drawer");
  const backdrop = document.getElementById("backdrop");

  function openDrawer() {
    if (!drawer || !backdrop || !openBtn) return;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    if (!drawer || !backdrop || !openBtn) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
  }

  openBtn?.addEventListener("click", (e) => { e.preventDefault(); openDrawer(); });
  closeBtn?.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); });
  backdrop?.addEventListener("click", closeDrawer);
  document.querySelectorAll(".drawer a").forEach(a => a.addEventListener("click", closeDrawer));

  // Demo links + form
  document.querySelectorAll("[data-demo-link]").forEach(a => {
    a.addEventListener("click", (e) => { e.preventDefault(); alert("Demo link — connect this to your real destination."); });
  });
  const form = document.getElementById("helpForm");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Demo submitted. Connect this form to your backend/email provider.");
  });
})();
