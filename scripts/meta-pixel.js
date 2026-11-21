(function initMetaPixel(window, document) {
  const pixelId = "1655494659371518";

  if (typeof window.fbq === "function") return;

  const fbq = function () {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
    } else {
      fbq.queue.push(arguments);
    }
  };

  window.fbq = fbq;
  window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const pixelScript = document.createElement("script");
  pixelScript.async = true;
  pixelScript.src = "https://connect.facebook.net/en_US/fbevents.js";

  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(pixelScript, firstScript);
  } else {
    document.head.appendChild(pixelScript);
  }

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
})(window, document);
