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

// Clear any persisted results when starting a fresh check
window.StateManager?.clearState?.();

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

document.getElementById('finish')?.addEventListener('click', async () => {
  if (!form?.reportValidity()) return;

  const errorEl = document.getElementById('finish-error');
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  const payload = gatherPayload();
  if (!payload.condition) {
    if (errorEl) {
      errorEl.textContent = 'Please choose a condition before finishing the check.';
      errorEl.hidden = false;
    }
    return;
  }

  try {
    if (window.Engine?.ready) {
      await window.Engine.ready();
    }
    if (!window.Engine?.evaluate) {
      throw new Error('The recommendation engine is still loading. Please wait a moment and try again.');
    }

    const result = window.Engine.evaluate(payload);
    if (!result) {
      throw new Error('Unable to generate guidance right now. Please try again.');
    }

    window.StateManager?.saveCheckState?.({
      condition: payload.condition,
      who: payload.who,
      what: payload.what,
      duration: payload.duration,
      meds: payload.meds,
      action: payload.action,
      answers: payload.answers,
      flags: result.flags || [],
      cautions: result.cautions || []
    });

    window.location.href = 'results.html';
  } catch (err) {
    console.error('Failed to finish structured check', err);
    if (errorEl) {
      errorEl.textContent = err.message || 'Something went wrong finishing the check. Please try again.';
      errorEl.hidden = false;
    } else {
      alert(err.message || 'Unable to finish the symptom check right now.');
    }
  }
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
  });
}

function collectConditionAnswers() {
  if (!form) return {};
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

const RED_FLAG_MAPPINGS = {
  headache: {
    thunderclap: ans => ans.onset === 'Yes',
    neurological_deficit: ans => ans.neuro === 'Yes',
    head_injury: ans => ans.injury === 'Yes',
    meningism: ans => ans.meningism === 'Yes',
    pregnancy_severe: ans => ans.pregnancySevere === 'Yes',
    age_new_50: ans => ans.age50 === 'Yes',
    progressive: ans => ans.duration === '> 7 days' || ans.duration === '> 14 days'
  },
  hayfever: {
    wheeze_breathless: ans => ans.breathing === 'Yes',
    severe_epistaxis: ans => ans.nosebleeds === 'Yes',
    severe_eye_pain: ans => ans.eyeSymptoms === 'Yes'
  },
  indigestion: {
    dysphagia: ans => ans.swallowing === 'Yes',
    gi_bleed: ans => ans.bleeding === 'Yes',
    unexplained_weight_loss: ans => ans.weightLoss === 'Yes',
    chest_pain_exertional: ans => ans.chestPain === 'Yes',
    new_over55: ans => ans.age55 === 'Yes'
  },
  diarrhoea: {
    blood_in_stool: ans => ans.blood === 'Yes',
    high_fever: ans => ans.fever === 'Yes',
    dehydration: ans => ans.dehydration === 'Yes',
    duration_3days: ans => ans.duration === '3-5 days' || ans.duration === '> 5 days',
    recent_antibiotics: ans => ans.antibiotics === 'Yes',
    travel_with_fever: ans => ans.travel === 'Yes',
    pregnancy: (ans, payload) => ans.pregnancy === 'Yes' || /pregnant/i.test(payload?.who || '')
  },
  sorethroat: {
    airway_compromise: ans => ans.breathing === 'Yes',
    severe_unilateral: ans => ans.unilateral === 'Yes',
    rash_fever: ans => ans.rash === 'Yes',
    duration_7days: ans => ans.duration === '> 7 days'
  }
};

function normaliseAnswersForEngine(conditionKey, answers, payloadContext) {
  const rawCopy = { ...answers };
  const normalised = { ...rawCopy };
  const rules = RED_FLAG_MAPPINGS[conditionKey];

  if (rules) {
    Object.entries(rules).forEach(([flagId, predicate]) => {
      let triggered = false;
      try {
        triggered = Boolean(predicate(rawCopy, payloadContext));
      } catch (err) {
        console.warn('Failed to evaluate red flag predicate', flagId, err);
        triggered = false;
      }
      if (triggered) {
        normalised[flagId] = true;
      } else {
        delete normalised[flagId];
      }
    });
  }

  normalised.__rawAnswers = rawCopy;
  return normalised;
}

function gatherPayload() {
  const condition = document.getElementById('condition')?.value || '';
  const who = document.getElementById('ww_who')?.value || '';
  const duration = document.getElementById('ww_howlong')?.value || '';
  const what = document.getElementById('ww_what')?.value?.trim() || '';
  const action = document.getElementById('ww_action')?.value?.trim() || '';
  const meds = document.getElementById('ww_medication')?.value?.trim() || '';
  const answers = collectConditionAnswers();

  const payload = { condition, who, duration, what, action, meds };
  payload.answers = normaliseAnswersForEngine(condition, answers, payload);
  return payload;
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

