document.querySelectorAll('[data-copy-zelle]').forEach((button) => {
  button.addEventListener('click', async () => {
    const status = button.closest('[data-qr-donations]').querySelector('[role="status"]');
    const email = button.dataset.copyZelle;
    try {
      await navigator.clipboard.writeText(email);
      status.textContent = 'Zelle email copied. Open your banking app, choose Zelle, and paste ' + email + ' as the recipient.';
    } catch {
      status.textContent = 'In your banking app, choose Zelle and enter ' + email + ' as the recipient.';
    }
  });
});
