(() => {
  const banner = document.querySelector('.page-home .home-toy-drive-banner');
  const header = document.querySelector('.page-home .site-header');
  if (!banner || !header) return;

  const updateOffsets = () => {
    document.documentElement.style.setProperty('--home-header-height', `${header.getBoundingClientRect().height}px`);
    document.documentElement.style.setProperty('--home-banner-height', `${banner.getBoundingClientRect().height}px`);
  };

  updateOffsets();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(updateOffsets);
    observer.observe(header);
    observer.observe(banner);
  }
  window.addEventListener('resize', updateOffsets, { passive: true });
  document.fonts?.ready.then(updateOffsets);
})();
