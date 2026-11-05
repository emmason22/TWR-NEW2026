document.querySelectorAll('[data-copy-zelle], [data-copy-paypal]').forEach((button) => {
  button.addEventListener('click', async () => {
    const status = button.closest('[data-qr-donations]').querySelector('[role="status"]');
    const email = button.dataset.copyZelle || button.dataset.copyPaypal;
    const method = button.dataset.copyZelle ? 'Zelle' : 'PayPal';
    const instructions = method === 'Zelle' ? 'Open your banking app, choose Zelle, and paste ' : 'Open PayPal and paste ';
    try {
      await navigator.clipboard.writeText(email);
      status.textContent = method + ' email copied. ' + instructions + email + ' as the recipient.';
    } catch {
      status.textContent = instructions + email + ' as the recipient.';
    }
  });
});
