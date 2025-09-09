// Basic stepper controls
const form = document.getElementById('check-form');
const steps = [...document.querySelectorAll('.step')];
const stepper = [...document.querySelectorAll('.stepper li')];

function go(to) {
  steps.forEach(s => s.hidden = s.dataset.step !== String(to));
  stepper.forEach(li => {
    li.classList.toggle('current', li.dataset.step === String(to));
  });
  current = to;
}
let current = 1;

form?.addEventListener('click', (e) => {
  const nextBtn = e.target.closest('.next');
  const prevBtn = e.target.closest('.prev');
  if (nextBtn) {
    if (!form.reportValidity()) return;
    if (current === 2) injectConditionQuestions(); // build step 3
    if (current === 3) buildReview();              // build step 4
    go(Math.min(current + 1, 4));
  }
  if (prevBtn) go(Math.max(current - 1, 1));
});

document.getElementById('finish')?.addEventListener('click', () => {
  alert('Finished demo. This prototype does not submit data.');
});

// ----------------------
// Condition question sets
// ----------------------

let conditionSets = {};
let conditionsError = null;
const conditionsPromise = fetch('data/conditions.json')
  .then(res => {
    if (!res.ok) throw new Error('Network response was not ok');
    return res.json();
  })
  .then(data => {
    conditionSets = data;
  })
  .catch(err => {
    console.error('Failed to load condition sets', err);
    conditionsError = 'Failed to load condition data.';
  });

// Build the condition-specific form based on selected condition + WWHAM
async function injectConditionQuestions() {
  await conditionsPromise;
  const c = document.getElementById('condition').value;
  const holder = document.getElementById('condition-questions');
  holder.innerHTML = '';
  document.getElementById('alerts').hidden = true;
  document.getElementById('alert-list').innerHTML = '';

  if (conditionsError) {
    holder.innerHTML = `<p class="muted">${conditionsError}</p>`;
    return;
  }

  if (!c || !conditionSets[c]) {
    holder.innerHTML = '<p class="muted">Select a condition first.</p>';
    return;
  }

  const cfg = conditionSets[c];
  const title = document.createElement('h2');
  title.textContent = cfg.title;
  holder.appendChild(title);

  cfg.questions.forEach(q => {
    const wrap = document.createElement(q.type === 'fieldset' ? 'fieldset' : 'div');
    wrap.className = 'field';
    if (q.type !== 'fieldset') {
      const label = document.createElement('label');
      label.textContent = q.label;
      const id = `${q.name}`;
      label.setAttribute('for', id);
      wrap.appendChild(label);
    }

    if (q.type === 'radio') {
      const row = document.createElement('div');
      row.className = 'choice-row';
      q.options.forEach(opt => {
        const lab = document.createElement('label');
        lab.className = 'choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = q.name;
        input.value = opt;
        lab.appendChild(input);
        lab.appendChild(document.createTextNode(opt));
        row.appendChild(lab);
      });
      wrap.appendChild(row);
    } else if (q.type === 'checkbox') {
      const row = document.createElement('div');
      row.className = 'choice-row';
      q.options.forEach(opt => {
        const lab = document.createElement('label');
        lab.className = 'choice';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = q.name;
        input.value = opt;
        lab.appendChild(input);
        lab.appendChild(document.createTextNode(opt));
        row.appendChild(lab);
      });
      wrap.appendChild(row);
    } else if (q.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = q.name;
      input.placeholder = q.label;
      wrap.appendChild(input);
    }
    holder.appendChild(wrap);
  });

  // Listen for answers to show alerts dynamically
  holder.addEventListener('change', () => {
    const ans = collectConditionAnswers();
    const alerts = getAlerts(c, ans);

    const box = document.getElementById('alerts');
    const list = document.getElementById('alert-list');
    list.innerHTML = '';
    if (alerts.length) {
      alerts.forEach(t => {
        const li = document.createElement('li');
        li.textContent = t;
        list.appendChild(li);
      });
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }, { once: true }); // attach once; radios/checkboxes will bubble
}

function collectConditionAnswers() {
  const data = {};
  const inputs = form.querySelectorAll('[data-step="3"] input, [data-step="3"] select, [data-step="3"] textarea');
  inputs.forEach(el => {
    if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
    } else if (el.type === 'checkbox') {
      if (!data[el.name]) data[el.name] = [];
      if (el.checked) data[el.name].push(el.value);
    } else {
      data[el.name] = el.value;
    }
  });
  return data;
}

function checkCondition(cond, ans) {
  const val = ans[cond.field];
  if ('equals' in cond) return val === cond.equals;
  if ('includes' in cond) return Array.isArray(val) && val.includes(cond.includes);
  if (cond.length) return Array.isArray(val) && val.length > 0;
  return false;
}

function getAlerts(c, ans) {
  const cfg = conditionSets[c];
  if (!cfg?.alerts) return [];
  const out = [];
  cfg.alerts.forEach(rule => {
    let triggered = false;
    if (rule.any) {
      triggered = rule.any.some(r => checkCondition(r, ans));
    } else {
      triggered = checkCondition(rule, ans);
    }
    if (triggered) out.push(rule.message);
  });
  return out;
}

function buildReview() {
  const review = document.getElementById('review');
  review.innerHTML = '';
  const pairs = [
    ['Condition', document.getElementById('condition').value || '-'],
    ['Who', document.getElementById('ww_who').value || '-'],
    ['Duration', document.getElementById('ww_howlong').value || '-'],
    ['What', document.getElementById('ww_what').value || '-'],
    ['Action taken', document.getElementById('ww_action').value || '-'],
    ['Current meds', document.getElementById('ww_medication').value || '-'],
  ];
  pairs.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'pair';
    row.innerHTML = `<div class="muted">${k}</div><div>${v}</div>`;
    review.appendChild(row);
  });

  // Summarise any alerts
  const c = document.getElementById('condition').value;
  if (c && conditionSets[c]) {
    const alerts = getAlerts(c, collectConditionAnswers());
    if (alerts.length) {
      const row = document.createElement('div');
      row.className = 'pair';
      row.innerHTML = `<div class="muted">Alerts</div><div>${alerts.join('<br>')}</div>`;
      review.appendChild(row);
    }
  }
}

