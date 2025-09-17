/* Simplified conversational chat system
   - Natural language understanding for symptoms
   - Chatty, friendly responses
   - Simple flow without complex agents
*/

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const formEl = document.getElementById('composer');
const restartEl = document.getElementById('restart');

const ORIENTATION_MESSAGES = [
  "Hi! I'm the Pharmalogic over-the-counter assistant. Tell me what's going on and we'll see which OTC options could be appropriate.",
  "Please always read the medicine packaging and patient leaflet, and never take more than the stated dose.",
  "I'm not a substitute for a doctor or emergency service. If anyone has severe symptoms, chest pain, breathing difficulty, heavy bleeding, or feels very unwell, call 999 or go to A&E."
];

const CLOSING_REMINDERS = [
  'Always read the patient information leaflet and follow the packaging instructions.',
  'Never exceed the stated dose or double up on medicines with the same active ingredient.',
  'Speak to a pharmacist, GP, or NHS 111 if symptoms persist, worsen, or you are unsure about suitability.',
  'For emergencies (severe pain, breathing difficulty, collapse, heavy bleeding) call 999 or go to A&E immediately.'
];

const OFF_TOPIC_RULES = [
  {
    regex: /(tell me a joke|joke|story|weather|who are you|what are you)/i,
    message:
      "I'm here specifically for pharmacy self-care questions. Let's focus on symptoms and medicines so I can keep you safe."
  },
  {
    regex: /(antibiotic|penicillin|amoxicillin|augmentin|morphine|oxycontin|codeine|controlled|prescription)/i,
    message:
      "I can only advise on non-prescription medicines. For prescription or controlled drugs you'll need to speak with a pharmacist or doctor."
  },
  {
    regex: /(diagnose|medical certificate|sick note|fit note|doctor.?s note)/i,
    message:
      "I can't diagnose conditions or issue medical certificates. I can help you decide whether over-the-counter treatment and pharmacist support are appropriate."
  }
];

const SUMMARY_TRIGGER = /\b(summary|summarise|summarize|recap|what have you got so far)\b/i;

function checkOffTopic(text){
  if(!text) return null;
  return OFF_TOPIC_RULES.find(rule => rule.regex.test(text)) || null;
}

function buildAcknowledgement(updates){
  if(!updates || !updates.length) return null;
  return updates.join(' ');
}

function buildReminderBlock(){
  return `<h4 style="margin: 12px 0 6px 0; color: #0369a1;">General safety reminders</h4><ul>${CLOSING_REMINDERS.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function joinWithAnd(list){
  if(!list || !list.length) return '';
  if(list.length === 1) return list[0];
  const copy = [...list];
  const last = copy.pop();
  return `${copy.join(', ')} and ${last}`;
}

const WHO_PATTERNS = [
  { value: 'adult', regex: /\badult\b|grown.?up/i },
  { value: 'teen 13–17', regex: /\bteen(ager)?\b|\b1[3-7]\b/i },
  { value: 'child 5–12', regex: /child|kid|\b(1[01]|[5-9])\b\s?(year|yo)/i },
  { value: 'toddler 1–4', regex: /toddler|\b[1-4]\b\s?(year|yo)/i },
  { value: 'infant <1', regex: /infant|newborn|under\s?1|baby/i },
  { value: 'pregnant', regex: /pregnan|expecting/i },
  { value: 'breastfeeding', regex: /breast\s?feeding|breastfeeding|nursing|lactat/i }
];

function detectWhoMentions(text){
  if(!text) return [];
  const low = text.toLowerCase();
  const matches = WHO_PATTERNS.filter(rule => rule.regex.test(low)).map(rule => rule.value);
  return Array.from(new Set(matches));
}

function describeOutstandingFields(){
  const missing = [];
  if(!state.who) missing.push('who the advice is for');
  if(!state.condition) missing.push('the main symptom we should focus on');
  if(!state.duration) missing.push('how long it has been going on');
  if(!state.action) missing.push('what you have already tried');
  if(!state.meds) missing.push('other medicines in use');
  return missing;
}

function summariseKnownState(){
  const bits = [];
  if(state.who) bits.push(`for ${state.who}`);
  if(state.condition) bits.push(`focused on ${CONDITION_LABELS[state.condition] || state.condition}`);
  if(state.duration) bits.push(`lasting ${state.duration}`);
  if(state.action) bits.push(state.action === 'none' ? 'nothing tried yet' : `already tried ${state.action}`);
  if(state.meds) bits.push(state.meds === 'none' ? 'no regular medicines reported' : `currently taking ${state.meds}`);
  return bits;
}

function handleRecapRequest(){
  const summaryParts = summariseKnownState();
  const missing = describeOutstandingFields();
  const pieces = [];
  if(summaryParts.length){
    pieces.push(`Here's what I have noted so far: ${summaryParts.join(', ')}.`);
  } else {
    pieces.push("I don't have enough detail yet to give advice.");
  }
  if(missing.length){
    if(missing.length === 1){
      pieces.push(`I still need ${missing[0]} before I can check medicines.`);
    } else {
      const last = missing.pop();
      pieces.push(`I still need ${missing.join(', ')} and ${last} before I can check medicines.`);
    }
  }
  pieces.push('Remember that I can only support over-the-counter questions.');
  botSpeak(pieces.join(' '));
  const next = getNextQuestion();
  if(next){
    state.currentQuestion = next.type === 'safety' ? null : next.type;
    const t = addTyping();
    setTimeout(() => replaceTyping(t, next.text), 800);
    showRelevantChips(next.type);
  }
}

function buildClosingSummary(){
  const warnings = state.flags?.length ? 'We discussed some red flag symptoms, so please seek urgent medical advice from NHS 111, your GP, or A&E as appropriate before using any OTC medicines. ' : '';
  const general = `${CLOSING_REMINDERS[0]} ${CLOSING_REMINDERS[1]}`;
  const reminder = 'If anything changes or you are unsure, speak with a pharmacist or healthcare professional.';
  return `${warnings}${general} ${reminder}`;
}

function maybeHandleClosure(text){
  if(!text) return false;
  const trimmed = text.trim();
  if(!/^(thanks|thank you|that's all|that is all|goodbye|bye)[.!\s]*$/i.test(trimmed)) return false;
  const message = buildClosingSummary();
  botSpeak(message);
  return true;
}

// ---------- UI helpers ----------
function addMsg(role, text, _options = {}) {
  const row = document.createElement('div');
  row.className = `msg ${role}`;
  const avatar = role === 'bot' ? '<div class="avatar" aria-hidden="true"></div>' : '';
  row.innerHTML = role === 'bot'
    ? `${avatar}<div class="bubble">${text}</div>`
    : `<div class="bubble">${text}</div>`;
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function addTyping() {
  const row = document.createElement('div');
  row.className = 'msg bot';
  row.innerHTML = `<div class="avatar" aria-hidden="true"></div>
                   <div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function replaceTyping(row, html) {
  row.querySelector('.bubble').innerHTML = html;
}

function botSpeak(text, opts = {}){
  const t = addTyping();
  const delay = opts.delay ?? Math.min(1200 + (text.length*6), 2200);
  setTimeout(()=> replaceTyping(t, text), delay);
  return t;
}

// Suggestion chips management
const quickRowEl = document.getElementById('quick-row');
const _defaultChipsHTML = quickRowEl ? quickRowEl.innerHTML : '';

function clearSuggestionChips(){ 
  if(quickRowEl) quickRowEl.innerHTML = _defaultChipsHTML; 
  bindChips(); 
}

function showSuggestionChips(list){
  if(!quickRowEl) return;
  quickRowEl.innerHTML = '';
  list.forEach(txt=>{
    const btn = document.createElement('button');
    btn.type = 'button'; 
    btn.className = 'chip'; 
    btn.dataset.chip = txt; 
    btn.textContent = txt;
    quickRowEl.appendChild(btn);
  });
  bindChips();
}

function bindChips(){
  document.querySelectorAll('#quick-row .chip').forEach(btn=>{
    btn.replaceWith(btn.cloneNode(true));
  });
  document.querySelectorAll('#quick-row .chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      inputEl.value = btn.dataset.chip;
      formEl.dispatchEvent(new Event('submit'));
    });
  });
}

// ---------- Natural Language Understanding ----------
const CONDITION_LABELS = {
  headache: 'headache',
  hayfever: 'hay fever',
  indigestion: 'indigestion/heartburn',
  diarrhoea: 'acute diarrhoea',
  sorethroat: 'sore throat',
  commoncold: 'common cold',
  cough: 'cough',
  constipation: 'constipation'
};

const CONDITION_PATTERNS = {
  headache: [
    /head(ache|s? (hurt|pain|pound|throb))/i,
    /migraine/i,
    /tension.*head/i,
    /pressure.*head/i
  ],
  hayfever: [
    /hay\s?fever/i,
    /(runny|stuffy|blocked).*nose/i,
    /(sneezing|sneez)/i,
    /allergic.*rhinitis/i,
    /eyes.*itch/i,
    /pollen/i,
    /seasonal.*allerg/i
  ],
  indigestion: [
    /heartburn/i,
    /indigestion/i,
    /acid.*reflux/i,
    /burning.*(chest|stomach)/i,
    /stomach.*burn/i,
    /after.*eat.*hurt/i
  ],
  diarrhoea: [
    /diarr?h(o|e)ea/i,
    /loose.*stool/i,
    /runny.*stool/i,
    /the.*runs/i,
    /tummy.*bug/i,
    /stomach.*upset/i
  ],
  sorethroat: [
    /sore.*throat/i,
    /throat.*(hurt|pain)/i,
    /hurt.*swallow/i,
    /pain.*swallow/i,
    /throat.*raw/i,
    /scratchy.*throat/i
  ],
  commoncold: [
    /common.*cold/i,
    /blocked.*nose/i,
    /stuffy/i,
    /congestion/i,
    /sniffles/i,
    /(runny|streaming).*nose/i
  ],
  cough: [
    /cough/i,
    /tickly.*throat/i,
    /chesty/i,
    /(phlegm|sputum)/i,
    /hacking/i,
    /whooping/i
  ],
  constipation: [
    /constipation/i,
    /hard.*stool/i,
    /no.*bowel/i,
    /straining/i,
    /not.*(poo|go)/i,
    /bowel.*stuck/i
  ]
};

function classifyCondition(text){
  if(!text) return null;

  for(const [condition, patterns] of Object.entries(CONDITION_PATTERNS)){
    for(const pattern of patterns){
      if(pattern.test(text)) return condition;
    }
  }
  return null;
}

function detectConditionMentions(text){
  if(!text) return [];
  const matches = [];
  for(const [condition, patterns] of Object.entries(CONDITION_PATTERNS)){
    if(patterns.some(pattern => pattern.test(text))){
      matches.push(condition);
    }
  }
  return matches;
}

function extractDuration(text){
  if(!text) return null;
  const t = text.toLowerCase();
  
  // Time patterns
  if(/today|this morning|few hours|started today/.test(t)) return '< 24 hours';
  if(/yesterday|last night|since yesterday/.test(t)) return '< 24 hours';
  if(/couple.*days?|2-3.*days?|few.*days?/.test(t)) return '1–3 days';
  if(/about.*week|nearly.*week|5-6.*days?/.test(t)) return '4–7 days';
  if(/over.*week|more.*week|weeks?|months?|long time/.test(t)) return '> 7 days';
  if(/comes?.*goes?|on.*off|recurring|frequent/.test(t)) return 'Recurrent / frequent';
  
  // Number matching
  const numMatch = t.match(/(\d+)\s*(hour|day|week)s?/);
  if(numMatch){
    const n = parseInt(numMatch[1]);
    const unit = numMatch[2];
    if(unit === 'hour' || n === 0) return '< 24 hours';
    if(unit === 'day'){
      if(n <= 3) return '1–3 days';
      if(n <= 7) return '4–7 days';
      return '> 7 days';
    }
    if(unit === 'week') return '> 7 days';
  }
  
  return null;
}

// ---------- Conversational Responses ----------
function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

const RESPONSES = {
  greetings: [
    "Hi! I'm here to help with over-the-counter medicine advice. What's bothering you today?",
    "Hello! Tell me what symptoms you're experiencing and I'll help find the right treatment.",
    "Hi there! What can I help you with today? Just describe what's going on in your own words."
  ],
  
  acknowledgments: [
    "I understand.",
    "Thanks for letting me know.",
    "Got it.",
    "Okay, that helps.",
    "I see."
  ],

  questions: {
    who: [
      "Who is this for?",
      "Is this for yourself or someone else?",
      "Can you tell me who needs treatment?"
    ],
    duration: [
      "How long has this been going on?",
      "When did this start?",
      "How long have you been experiencing this?"
    ],
    action: [
      "What have you already tried?",
      "Have you taken anything for this yet?",
      "Any treatments you've already used?"
    ],
    meds: [
      "Are you currently taking any medicines?",
      "Any regular medications I should know about?",
      "What medicines do you normally take?"
    ]
  },

  safety: {
    headache: "Just to be safe - is this a sudden 'worst ever' headache, or do you have any weakness, confusion, or vision problems?",
    hayfever: "Any pregnancy, breastfeeding, or health conditions I should know about?",
    indigestion: "Are you having trouble swallowing, or any severe pain?",
    diarrhoea: "Is there any blood, high fever, or has this been going on more than a week?",
    sorethroat: "Any high fever, trouble swallowing, or has this lasted over a week?",
    commoncold: "Any chest tightness, shortness of breath, or symptoms lasting longer than 10 days?",
    cough: "Have you had this cough for more than 3 weeks, or are you breathless or coughing up blood?",
    constipation: "Any severe stomach pain, vomiting, or blood when you go to the toilet?"
  }
};

// ---------- Conversation state ----------
const state = {
  step: 'greet',
  who: null,
  duration: null,
  what: '',
  action: '',
  meds: '',
  condition: null,
  flags: [],
  cautions: [],
  currentQuestion: null, // Track what we're currently asking
  lastPayload: null
};

function resetState() {
  state.step = 'greet';
  state.who = null;
  state.duration = null;
  state.what = '';
  state.action = '';
  state.meds = '';
  state.condition = null;
  state.flags = [];
  state.cautions = [];
  state.currentQuestion = null;
  state.lastPayload = null;
}

// ---------- Message Analysis ----------
function describeNluFlag(pattern) {
  if (!pattern) return null;
  if (/vomit|stool|blood/i.test(pattern)) return 'Mentioned blood in vomit or stool.';
  if (/chest|abdominal/i.test(pattern)) return 'Mentioned severe chest or abdominal pain.';
  if (/collapse|unconscious/i.test(pattern)) return 'Mentioned collapse or loss of consciousness.';
  if (/stiff neck|rash/i.test(pattern)) return 'Mentioned meningitis warning signs (stiff neck or rash).';
  return 'Mentioned a potential red flag symptom.';
}

function analyzeMessage(text) {
  const t = text.toLowerCase();
  const heuristics = {
    condition: classifyCondition(text),
    duration: extractDuration(text),
    who: null,
    action: null,
    meds: null
  };

  if (/adult|grown.?up|myself|me|my|i/i.test(t)) heuristics.who = 'adult';
  else if (/teen|teenager|13|14|15|16|17/i.test(t)) heuristics.who = 'teen 13–17';
  else if (/child|kid|son|daughter|8|9|10|11|12/i.test(t)) heuristics.who = 'child 5–12';
  else if (/toddler|little one|2|3|4.year/i.test(t)) heuristics.who = 'toddler 1–4';
  else if (/baby|infant|newborn|under.?1/i.test(t)) heuristics.who = 'infant <1';
  else if (/pregnant|pregnancy|expecting/i.test(t)) heuristics.who = 'pregnant';
  else if (/breastfeeding|nursing|breast.?feeding/i.test(t)) heuristics.who = 'breastfeeding';

  if (/nothing|none|haven.?t tried/i.test(t)) heuristics.action = 'none';
  else if (/paracetamol|tylenol/i.test(t)) heuristics.action = 'paracetamol';
  else if (/ibuprofen|advil|nurofen/i.test(t)) heuristics.action = 'ibuprofen';
  else if (/tried.*(rest|sleep|lying)/i.test(t)) heuristics.action = 'rest';

  if (/no.?(medicine|medication|meds)|nothing|none/i.test(t)) heuristics.meds = 'none';

  const nlu = window.NLU?.analyze?.(text, state) || {};
  const combinedFlags = new Set();

  if (/worst.ever|thunderclap|sudden.severe/i.test(t)) combinedFlags.add('Sudden severe headache mentioned.');
  if (/blood|bleeding/i.test(t)) combinedFlags.add('Bleeding symptoms mentioned.');
  if (/can.?t breathe|chest pain|collapse/i.test(t)) combinedFlags.add('Possible emergency symptoms mentioned.');

  if (Array.isArray(nlu.redFlags)) {
    nlu.redFlags.forEach(flag => {
      const desc = describeNluFlag(flag);
      if (desc) combinedFlags.add(desc);
    });
  }

  return {
    condition: heuristics.condition || nlu.condition || null,
    duration: heuristics.duration || nlu.duration || null,
    who: nlu.who || heuristics.who || null,
    action: nlu.action || heuristics.action || null,
    meds: nlu.meds || heuristics.meds || null,
    redFlags: Array.from(combinedFlags)
  };
}

function getNextQuestion() {
  if (!state.who) return { 
    type: 'who', 
    text: getRandomResponse(RESPONSES.questions.who) + " (adult, teen 13–17, child 5–12, toddler 1–4, infant <1, pregnant, breastfeeding)"
  };
  if (!state.condition) return { 
    type: 'condition', 
    text: "What's the main problem you're dealing with? (headache, hay fever, heartburn, diarrhoea, sore throat)"
  };
  if (!state.duration) return { 
    type: 'duration', 
    text: getRandomResponse(RESPONSES.questions.duration) + " (< 24 hours, 1–3 days, 4–7 days, > 7 days, recurrent)"
  };
  if (!state.action) return { 
    type: 'action', 
    text: getRandomResponse(RESPONSES.questions.action) + " (e.g., rest, fluids, paracetamol, antacid - or say 'none')"
  };
  if (!state.meds) return { 
    type: 'meds', 
    text: getRandomResponse(RESPONSES.questions.meds) + " (e.g., ibuprofen, antihistamine - or say 'none')"
  };
  return { 
    type: 'safety', 
    text: RESPONSES.safety[state.condition] || "Any concerning symptoms I should know about?"
  };
}

function updateStateFromAnalysis(analysis) {
  const updates = [];
  const push = sentence => {
    updates.push(updates.length ? sentence : `Thanks, ${sentence}`);
  };

  if (analysis.condition && !state.condition) {
    state.condition = analysis.condition;
    push(`I've noted we're focusing on ${CONDITION_LABELS[analysis.condition] || analysis.condition}.`);
  }
  if (analysis.duration && !state.duration) {
    state.duration = analysis.duration;
    push(`I've recorded the duration as ${analysis.duration}.`);
  }
  if (analysis.who && !state.who) {
    state.who = analysis.who;
    push(`I've noted this is for ${analysis.who}.`);
  }
  if (analysis.action && !state.action) {
    state.action = analysis.action;
    if (analysis.action === 'none') {
      push("I've noted that nothing has been tried yet.");
    } else {
      push(`I've recorded that you've already tried ${analysis.action}.`);
    }
  }
  if (analysis.meds && !state.meds) {
    state.meds = analysis.meds;
    if (analysis.meds === 'none') {
      push("I've noted that no other regular medicines are in use.");
    } else {
      push(`I've noted that you're currently taking ${analysis.meds}.`);
    }
  }
  return updates;
}

function addFlag(message) {
  if (!message) return;
  if (!state.flags.includes(message)) state.flags.push(message);
}

// More precise extraction to catch specific answers
function fillSlotFromText(text, currentStep) {
  const t = text.toLowerCase().trim();
  
  if (currentStep === 'who') {
    if (/adult|grown.?up/i.test(t)) return 'adult';
    if (/teen|teenager|13|14|15|16|17/i.test(t)) return 'teen 13–17';
    if (/child|kid|5|6|7|8|9|10|11|12/i.test(t)) return 'child 5–12';
    if (/toddler|1|2|3|4.year/i.test(t)) return 'toddler 1–4';
    if (/baby|infant|newborn|under.?1/i.test(t)) return 'infant <1';
    if (/pregnant|pregnancy|expecting/i.test(t)) return 'pregnant';
    if (/breastfeeding|nursing/i.test(t)) return 'breastfeeding';
  }

  if (currentStep === 'condition') {
    const mentions = detectConditionMentions(text);
    if (mentions.length === 1) return mentions[0];
    const trimmed = t.replace(/\s+/g, ' ').trim();
    for (const [key, label] of Object.entries(CONDITION_LABELS)) {
      if (trimmed === label.toLowerCase() || trimmed === key || trimmed === label.replace(/\s+/g, '')) {
        return key;
      }
    }
  }

  if (currentStep === 'duration') {
    if (/<\s*24\s*hours?|today|this morning|few hours/i.test(t)) return '< 24 hours';
    if (/1.?3\s*days?|couple.*days?|few.*days?/i.test(t)) return '1–3 days';
    if (/4.?7\s*days?|about.*week|nearly.*week/i.test(t)) return '4–7 days';
    if (/>.*7\s*days?|over.*week|more.*week|weeks?|months?/i.test(t)) return '> 7 days';
    if (/recurrent|recurring|on.*off|comes.*goes/i.test(t)) return 'Recurrent / frequent';
  }
  
  if (currentStep === 'action') {
    if (/nothing|none|haven.?t tried/i.test(t)) return 'none';
    return t; // Store whatever they say
  }
  
  if (currentStep === 'meds') {
    if (/nothing|none|no.?(medicine|medication)/i.test(t)) return 'none';
    if (/no other (meds?|medications?|medicine)/i.test(t)) return 'none';
    return t; // Store whatever they say
  }
  
  return null;
}

function evaluateSafety(text) {
  const t = text.toLowerCase();
  
  // Check for red flags based on condition and general symptoms
  if (state.condition === 'headache' && /worst.ever|thunderclap|head.injury|weakness|confusion|vision/i.test(t)) {
    addFlag('Headache red flags — seek urgent advice (pharmacist/GP/111).');
  }
  if (state.condition === 'indigestion' && /trouble.swallow|vomit.*blood|black.stool|severe.pain/i.test(t)) {
    addFlag('Indigestion red flags — urgent medical assessment needed.');
  }
  if (state.condition === 'diarrhoea' && /blood|high.fever|severe.pain|week/i.test(t)) {
    addFlag('Diarrhoea red flags — seek medical advice.');
  }

  // General emergency symptoms
  if(/chest.pain|can.?t.breathe|collapse|vomit.*blood/i.test(t)) {
    addFlag('Emergency symptoms — call 999 or go to A&E immediately.');
  }
}

// ---------- Flow Control ----------
function greet(){
  ORIENTATION_MESSAGES.forEach((msg, idx) => {
    setTimeout(() => botSpeak(msg), idx * 2000);
  });
  setTimeout(() => botSpeak(getRandomResponse(RESPONSES.greetings)), ORIENTATION_MESSAGES.length * 2000);
  state.step = 'chat';
}

function handleUserMessage(text){
  if (text) state.what = state.what ? state.what + ' ' + text : text;

  const rule = checkOffTopic(text);
  if (rule) {
    botSpeak(rule.message);
    clearSuggestionChips();
    return;
  }

  if (text && SUMMARY_TRIGGER.test(text)) {
    clearSuggestionChips();
    handleRecapRequest();
    return;
  }

  if (maybeHandleClosure(text)) {
    clearSuggestionChips();
    return;
  }

  const whoMentions = detectWhoMentions(text);
  if (whoMentions.length > 1) {
    state.who = null;
    state.currentQuestion = 'who';
    botSpeak(`I heard more than one set of patient details (${joinWithAnd(whoMentions)}). Please choose the single option that matches who needs help.`);
    showRelevantChips('who');
    return;
  }
  if (state.who && whoMentions.length === 1 && state.who !== whoMentions[0]) {
    state.who = null;
    state.currentQuestion = 'who';
    botSpeak(`Thanks for the update. Should I switch the advice to ${whoMentions[0]} instead? Pick the option that fits best so I can be sure.`);
    showRelevantChips('who');
    return;
  }
  if (state.currentQuestion === 'who' && text && !whoMentions.length) {
    botSpeak('To keep you safe I need to know who the advice is for. Please choose one option such as adult, teen 13–17, child 5–12, toddler 1–4, infant <1, pregnant, or breastfeeding.');
    showRelevantChips('who');
    return;
  }

  const conditionMentions = detectConditionMentions(text);
  if (conditionMentions.length > 1) {
    state.condition = null;
    state.currentQuestion = 'condition';
    const labels = conditionMentions.map(key => CONDITION_LABELS[key] || key);
    botSpeak(`I spotted a few different symptoms (${joinWithAnd(labels)}). Tell me which one you'd like me to focus on first.`);
    showRelevantChips('condition');
    return;
  }
  if (state.condition && conditionMentions.length === 1 && state.condition !== conditionMentions[0]) {
    state.condition = null;
    state.currentQuestion = 'condition';
    const label = CONDITION_LABELS[conditionMentions[0]] || conditionMentions[0];
    botSpeak(`Just to double-check: should we focus on ${label} instead? Choose the condition so I can keep the advice accurate.`);
    showRelevantChips('condition');
    return;
  }
  if (state.currentQuestion === 'condition' && text && !conditionMentions.length) {
    botSpeak("I don't have data for that concern. I can help with headache, hay fever, heartburn, diarrhoea, sore throat, common cold, cough, or constipation. Which of those fits best?");
    showRelevantChips('condition');
    return;
  }

  if (state.currentQuestion) {
    const slotValue = fillSlotFromText(text, state.currentQuestion);
    if (slotValue) {
      const key = state.currentQuestion;
      state[key] = slotValue;
      state.currentQuestion = null;
      let ack = null;
      if (key === 'who') ack = `Thanks, I've noted this is for ${slotValue}.`;
      else if (key === 'duration') ack = `Thanks, I've recorded the duration as ${slotValue}.`;
      else if (key === 'action') ack = slotValue === 'none' ? "Thanks, I've noted that nothing has been tried yet." : `Thanks, I've noted you've already tried ${slotValue}.`;
      else if (key === 'meds') ack = slotValue === 'none' ? "Thanks, I've recorded that there are no other regular medicines in use." : `Thanks, I've noted the regular medicines: ${slotValue}.`;
      if (ack) botSpeak(ack, { delay: 300 });
      else botSpeak(getRandomResponse(RESPONSES.acknowledgments), { delay: 300 });

      setTimeout(() => {
        const next = getNextQuestion();
        if (next.type === 'safety') {
          state.step = 'safety';
        } else {
          state.currentQuestion = next.type;
        }
        const t = addTyping();
        setTimeout(() => replaceTyping(t, next.text), 800);
        showRelevantChips(next.type);
      }, 1000);
      return;
    }
  }

  const analysis = analyzeMessage(text);
  const updates = updateStateFromAnalysis(analysis);

  if (analysis.redFlags.length) {
    analysis.redFlags.forEach(addFlag);
  }

  if (updates.length) {
    const ack = buildAcknowledgement(updates);
    if (ack) {
      setTimeout(() => botSpeak(ack, { delay: 300 }), 200);
    }
  }

  const next = getNextQuestion();

  if (next.type === 'safety') {
    state.step = 'safety';
    state.currentQuestion = null;
    const t = addTyping();
    setTimeout(() => replaceTyping(t, next.text), updates.length ? 1200 : 800);
    clearSuggestionChips();
    return;
  }

  state.currentQuestion = next.type;
  const delay = updates.length ? 1200 : 800;
  const t = addTyping();
  setTimeout(() => replaceTyping(t, next.text), delay);

  showRelevantChips(next.type);
}

async function handleSafetyCheck(text){
  evaluateSafety(text);

  // Generate final advice
  const payload = {
    condition: state.condition,
    who: state.who,
    duration: state.duration,
    what: state.what,
    action: state.action,
    meds: state.meds,
    answers: {}
  };

  state.lastPayload = payload;

  let result;
  try {
    if (window.Engine?.ready) {
      await window.Engine.ready();
    }
    result = window.Engine?.evaluate ? window.Engine.evaluate(payload) : {
      title:'General', advice:[], selfCare:[], cautions:[], flags:[]
    };
  } catch (err) {
    console.error('Engine evaluation error', err);
    const message = `System issue: ${err.message}. Please speak with a pharmacist or try again later.`;
    result = {
      title: 'General',
      advice: [],
      selfCare: [],
      cautions: [message],
      warnings: [message],
      flags: [],
      error: err.message
    };
  }

  // Merge our flags with engine flags
  result.flags = Array.from(new Set([...(result.flags||[]), ...state.flags]));
  result.cautions = Array.from(new Set([...(result.cautions||[]), ...state.cautions]));
  if (!Array.isArray(result.warnings)) {
    result.warnings = [];
  }

  showFinalAdvice(result, payload);
}

function sanitizeLLMHtml(html) {
  if (!html) return '';
  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,link,meta,iframe').forEach(el => el.remove());
    return doc.body.innerHTML;
  } catch (err) {
    console.warn('Failed to sanitise LLM response', err);
    return '';
  }
}

async function fetchLLMSummary(payload, engineResult) {
  if (!window.fetch) return null;
  const prompt = `Summarise the over-the-counter guidance for ${payload.condition || 'this condition'} in one short paragraph. Highlight any red flags and keep the tone supportive.`;
  try {
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, engineResult })
    });
    if (!response.ok) {
      if (response.status !== 501) {
        console.info('LLM proxy responded with status', response.status);
      }
      return null;
    }
    const data = await response.json();
    const safe = sanitizeLLMHtml(data.text || '');
    return safe || null;
  } catch (err) {
    console.warn('Unable to reach LLM proxy', err);
    return null;
  }
}

function showRelevantChips(type) {
  const chips = {
    who: ['adult','teen 13–17','child 5–12','toddler 1–4','infant <1','pregnant','breastfeeding'],
    duration: ['< 24 hours','1–3 days','4–7 days','> 7 days','recurrent'],
    condition: ['headache','hay fever','heartburn','diarrhoea','sore throat','common cold','cough','constipation'],
    action: ['none','paracetamol','rest','fluids','antacid'],
    meds: ['none','ibuprofen','antihistamine','paracetamol']
  };
  
  if (chips[type]) {
    showSuggestionChips(chips[type]);
  } else {
    clearSuggestionChips();
  }
}

function showFinalAdvice(result, payload) {
  const t = addTyping();
  setTimeout(async () => {
    // Build proper medical advice display like the original system
    let medAdvice = '';
    const summaryHtml = `<strong>Summary</strong><br>Condition: ${state.condition || '-'}<br>Who: ${state.who || '-'}<br>Duration: ${state.duration || '-'}<br>Action taken: ${state.action || '-'}<br>Current meds: ${state.meds || '-'}<br><br>`;
    
    // Check for red flags first
    const hasFlags = (result?.flags?.length || 0) > 0 || state.flags.length > 0;
    
    if (hasFlags) {
      medAdvice = '<div class="med-summary"><h3>⚠️ Safety Priority</h3><p>Red flag symptoms detected. Do not start new OTC medicines until a healthcare professional reviews you. Seek urgent advice now (NHS 111, GP, or emergency services if severe bleeding, chest pain, collapse, or vomiting blood).</p>';
      if (result?.flags?.length) {
        medAdvice += '<ul>' + result.flags.map(f=>`<li class="danger">${f}</li>`).join('') + '</ul>';
      }
      medAdvice += '</div>';
    } else if (result && result.advice?.length) {
      medAdvice = '<div class="med-summary"><h3>💊 Recommended Medications</h3>';
      result.advice.forEach((med) => {
        medAdvice += `<div class="med-card"><h4>${med.name || med}</h4>`;
        if (med.ingredient) medAdvice += `<p class="med-meta"><strong>Active ingredient:</strong> ${med.ingredient}</p>`;
        if (med.description) medAdvice += `<p class="med-meta"><em>${med.description}</em></p>`;
        if (med.dosage) medAdvice += `<p><strong>Dosage:</strong> ${med.dosage}</p>`;
        if (med.ageLimits) {
          const bits = [];
          if (med.ageLimits.min_years != null) bits.push(`Minimum age ${med.ageLimits.min_years} years`);
          if (med.ageLimits.max_years != null) bits.push(`Maximum age ${med.ageLimits.max_years} years`);
          if (med.ageLimits.note) bits.push(med.ageLimits.note);
          if (bits.length) medAdvice += `<p><strong>Age guidance:</strong> ${bits.join(' · ')}</p>`;
        }
        if (Array.isArray(med.pediatric) && med.pediatric.length) {
          medAdvice += '<details class="peds"><summary>Paediatric dosing</summary><ul>';
          med.pediatric.forEach(entry => {
            if (typeof entry === 'string') {
              medAdvice += `<li>${entry}</li>`;
            } else if (entry) {
              const label = entry.age_range ? `<strong>${entry.age_range}:</strong> ` : '';
              const extra = entry.max_daily ? ` (max ${entry.max_daily})` : '';
              const text = entry.dose || entry.guidance || '';
              medAdvice += `<li>${label}${text}${extra}</li>`;
            }
          });
          medAdvice += '</ul></details>';
        }
        if (Array.isArray(med.rationale) && med.rationale.length) {
          medAdvice += `<details class="rationale"><summary>Why this appears suitable</summary><ul>`+
            med.rationale.map(r=>`<li>${r}</li>`).join('') + `</ul></details>`;
        }
        medAdvice += `</div>`;
      });
      
      if (result.generalTiming?.length) {
        medAdvice += `<h4 class="section info">⏰ When to Take</h4><ul>`;
        result.generalTiming.forEach(item => medAdvice += `<li>${item}</li>`);
        medAdvice += `</ul>`;
      }
      if (result.administration?.length) {
        medAdvice += `<h4 class="section info">📋 How to Take</h4><ul>`;
        result.administration.forEach(item => medAdvice += `<li>${item}</li>`);
        medAdvice += `</ul>`;
      }
      if (result.storage?.length) {
        medAdvice += `<h4 class="section info">🏠 Storage</h4><ul>`;
        result.storage.forEach(item => medAdvice += `<li>${item}</li>`);
        medAdvice += `</ul>`;
      }
      if (result.warnings?.length) {
        medAdvice += `<h4 class="section danger">⚠️ Important Warnings</h4><ul>`;
        result.warnings.forEach(item => medAdvice += `<li class="danger">${item}</li>`);
        medAdvice += `</ul>`;
      }
      if (result.selfCare?.length) {
        medAdvice += `<h4 class="section tip">🌿 Self-Care Tips</h4><ul>`;
        result.selfCare.forEach(item => medAdvice += `<li>${item}</li>`);
        medAdvice += `</ul>`;
      }
      
      // Append reasoning trace (collapsed)
      if (result.trace) {
        const optTrace = (result.trace.options||[]).map(o=>{
          return `<li><strong>${o.option}</strong>: ${o.included?'<span style="color:#059669">included</span>':'<span style="color:#dc2626">excluded</span>'}${o.reasons?.length?'<ul>'+o.reasons.map(r=>`<li>${r}</li>`).join('')+'</ul>':''}</li>`;
        }).join('');
        medAdvice += `<details class="trace"><summary>🔍 Reasoning trace</summary><div><p>${result.trace.steps.map(s=>`<div>• ${s}</div>`).join('')}</p><ul>${optTrace}</ul></div></details>`;
      }
      medAdvice += '</div>';
    } else {
      medAdvice = '<div class="med-summary"><p>No OTC options identified; consult a pharmacist or GP.</p></div>';
    }
    
    const bullets = (arr)=> arr.map(x=>`• ${x}`).join('<br>');
    
    let finalHtml = summaryHtml + medAdvice;

    if (result.error) {
      finalHtml = `<div class="med-summary"><h3>⚠️ System notice</h3><p>Something went wrong loading the full dataset (${result.error}). Please speak with a pharmacist or try again later before taking any new medicine.</p></div>` + finalHtml;
    }

    if (result.cautions?.length) {
      finalHtml += `<h4 style="color: #d97706; margin: 12px 0 6px 0;">⚠️ Cautions</h4>${bullets(result.cautions)}<br><br>`;
    }

    if (result.flags?.length) {
      finalHtml += `<h4 style="color: #dc2626; margin: 12px 0 6px 0;">🚨 Red Flags - Seek Medical Attention</h4>${bullets(result.flags)}<br><br>`;
    }

    finalHtml += `<div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 12px; margin: 12px 0;">
      <p style="margin: 0; color: #0c4a6e;"><strong>Next Steps:</strong> You can ask me more questions or start a new consultation.</p>
    </div>`;

    finalHtml += buildReminderBlock();

    const llmSummary = await fetchLLMSummary(payload || state.lastPayload || {}, result);
    if (llmSummary) {
      finalHtml = `<div class="med-summary"><h3>🤖 Conversation summary</h3>${llmSummary}</div>` + finalHtml;
    }

    window.StateManager?.saveCheckState?.({
      condition: payload?.condition || state.condition,
      who: payload?.who || state.who,
      what: state.what,
      duration: payload?.duration || state.duration,
      meds: payload?.meds || state.meds,
      action: payload?.action || state.action,
      answers: payload?.answers || {},
      flags: result.flags || [],
      cautions: result.cautions || []
    });

    replaceTyping(t, finalHtml + `<div class="chat-actions" style="margin-top: 12px;"><a class="btn btn-primary" href="results.html">View printable results</a></div>`);
    state.step = 'chat'; // Allow continuing the conversation
    clearSuggestionChips();

    // Save state for results page
    sessionStorage.setItem('checkPayload', JSON.stringify({
      condition: state.condition, who: state.who, duration: state.duration, howlong: state.duration,
      what: state.what, action: state.action, meds: state.meds, answers: payload?.answers || {}
    }));
  }, 1000);
}

// ---------- Event Handlers ----------
formEl.addEventListener('submit', (e)=>{
  e.preventDefault();
  const text = (inputEl.value || '').trim();
  if (!text) return;
  
  inputEl.value = '';
  addMsg('user', text);
  
  if (state.step === 'safety') {
    handleSafetyCheck(text);
  } else {
    handleUserMessage(text);
  }
});

if (restartEl) {
  restartEl.addEventListener('click', ()=>{
    resetState();
    window.StateManager?.clearState?.();
    messagesEl.innerHTML='';
    greet();
    clearSuggestionChips();
  });
}

if (typeof window !== 'undefined') {
  window.ChatInternals = {
    analyzeMessage,
    fillSlotFromText,
    evaluateSafety,
    getNextQuestion,
    resetState,
    state
  };
}

// Initialize suggestion chips binding
bindChips();

// Start the conversation
greet();
