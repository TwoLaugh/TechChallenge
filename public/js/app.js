// Ensure accidental editable states are disabled (some browsers retain them after devtools tweaks)
function stripResidualEditing(root = document) {
  const body = root?.body;
  if (!body) return;

  const disable = el => {
    if (!el) return;
    if (el.isContentEditable || el.getAttribute?.('contenteditable')) {
      el.contentEditable = 'false';
      el.removeAttribute('contenteditable');
    }
  };

  disable(body);
  body.querySelectorAll('[contenteditable]')
    .forEach(disable);

  if (root?.designMode && root.designMode.toLowerCase?.() === 'on') {
    root.designMode = 'off';
  }
}

stripResidualEditing();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => stripResidualEditing());
}

document.addEventListener('focusin', event => {
  const target = event.target;
  if (target && typeof target === 'object' && 'isContentEditable' in target && target.isContentEditable) {
    target.contentEditable = 'false';
    target.removeAttribute('contenteditable');
  }
});

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
