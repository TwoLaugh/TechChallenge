(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const statusEl = document.getElementById('form-status');
    const submitBtn = form.querySelector('button[type="submit"]');

    function setStatus(message, tone = 'info') {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.classList.remove('error', 'success');
      if (tone === 'error') statusEl.classList.add('error');
      if (tone === 'success') statusEl.classList.add('success');
    }

    async function sendContact(payload) {
      if (!window.fetch) {
        throw new Error('Modern browser with fetch support required.');
      }
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = data?.error || `Server responded with status ${response.status}`;
        const detail = data?.detail ? ` ${data.detail}` : '';
        throw new Error(`${error}${detail}`.trim());
      }
      return data;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const formData = new window.FormData(form);
      const payload = {
        name: formData.get('name')?.trim(),
        email: formData.get('email')?.trim(),
        phone: formData.get('phone')?.trim() || null,
        reason: formData.get('reason'),
        contact_pref: formData.get('contact_pref'),
        message: formData.get('message')?.trim(),
        consent: formData.get('consent') === 'on'
      };

      setStatus('Sending your message…');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await sendContact(payload);
        const humanMessage = res?.message || 'Thanks! Your enquiry has been queued. We will be in touch soon.';
        setStatus(humanMessage, 'success');
        form.reset();
      } catch (err) {
        console.error('Contact submission failed', err);
        setStatus(`We could not submit your request: ${err.message}`, 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
})();
