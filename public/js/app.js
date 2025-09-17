// Ensure accidental editable states are disabled (some browsers retain them after devtools tweaks)
if (document?.body?.isContentEditable) {
  document.body.contentEditable = 'false';
}
if (document?.body?.hasAttribute('contenteditable')) {
  document.body.removeAttribute('contenteditable');
}
if (document?.designMode === 'on') {
  document.designMode = 'off';
}

// Mobile menu toggle with proper ARIA
const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu');
if (toggle && menu) {
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Optional: smooth scroll for in-page links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

document.addEventListener('click', (e) => { if (e.target.closest('.start-check')) { window.location.href = 'check.html'; } });
