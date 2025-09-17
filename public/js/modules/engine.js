/* global module */
(function(global){
  const DATA_URL = 'data/bnf.json';
  const COUNSELLING_URL = 'data/bnf_counselling.json';

  // fetch datasets once and hold in-memory
  let dataset = null;
  let loadingError = null;

  // Kick off both fetches up-front; when both are ready, enrich dataset
  const datasetPromise = Promise.all([fetch(DATA_URL), fetch(COUNSELLING_URL)])
    .then(async ([rBNF, rCX]) => {
      if (!rBNF.ok) throw new Error('Failed to load BNF dataset');
      const bnf = await rBNF.json();

      let cx = null;
      if (rCX.ok) {
        try { cx = await rCX.json(); }
        catch(e){ console.warn('bnf_counselling.json parse issue:', e); }
      } else {
        console.warn('bnf_counselling.json not found; using built-in fallbacks');
      }

      // Defaults & fallbacks (used if JSON is missing bits)
      const DEFAULTS = {
        how_to_store: [
          "Store medicines in a cool, dry place below 25°C unless the pack says otherwise.",
          "Keep out of sight and reach of children.",
          "Do not use after the expiry date or if the seal is broken."
        ],
        general_medication_administration_guidelines: [
          "Always read the patient information leaflet and follow the pack instructions.",
          "Do not exceed the stated dose. If a dose is missed, take it when remembered unless it is nearly time for the next dose—do not double up.",
          "Avoid taking multiple products containing the same active ingredient (e.g., paracetamol in cold/flu remedies).",
          "If symptoms worsen or do not improve within the timeframe noted for this condition, seek advice from a pharmacist, GP, or NHS 111."
        ]
      };
      const FALLBACKS = {
        when_to_take: ["Use recommended products as directed on the pack during symptomatic periods."],
        how_to_take_properly: ["Follow the instructions on the label; ask a pharmacist if unsure."],
        what_side_effects_to_watch_for: ["Stop and seek advice if severe rash, breathing difficulty, swelling, or persistent worsening occurs."],
        important_safety_considerations: ["Check age limits, pregnancy/breastfeeding advice, existing conditions and other medicines before use."]
      };

      const defStore = cx?.defaults?.how_to_store || DEFAULTS.how_to_store;
      const defGeneral = cx?.defaults?.general_medication_administration_guidelines || DEFAULTS.general_medication_administration_guidelines;
      const fb = cx?.fallbacks || FALLBACKS;
      const byId = cx?.by_condition_id || {};

      // Attach patient_counselling to every condition
      for (const cond of bnf.conditions || []) {
        const o = byId[cond.id] || {};
        cond.patient_counselling = {
          when_to_take: o.when_to_take || fb.when_to_take,
          how_to_take_properly: o.how_to_take_properly || fb.how_to_take_properly,
          how_to_store: defStore,
          what_side_effects_to_watch_for: o.what_side_effects_to_watch_for || fb.what_side_effects_to_watch_for,
          important_safety_considerations: o.important_safety_considerations || fb.important_safety_considerations,
          general_medication_administration_guidelines: defGeneral
        };
      }

      dataset = bnf;
      return dataset;
    })
    .catch(err => {
      loadingError = err;
      console.error('Failed to initialise datasets', err);
      throw err;
    });

  function ready(){
    if (dataset) return Promise.resolve(dataset);
    if (loadingError) return Promise.reject(loadingError);
    return datasetPromise;
  }

  const condMap = {
    headache: 'headache-simple',
    hayfever: 'allergic-rhinitis',
    indigestion: 'dyspepsia-heartburn',
    diarrhoea: 'acute-diarrhoea',
    sorethroat: 'sore-throat-acute',
    commoncold: 'common-cold',
    cough: 'cough-acute',
    constipation: 'constipation'
  };

  function getDetails(payload){
    const map = {
      'adult': {age:30},
      'teen 13–17': {age:15},
      'teen 13-17': {age:15},
      'child 5–12': {age:8},
      'child 5-12': {age:8},
      'toddler 1–4': {age:3},
      'toddler 1-4': {age:3},
      'infant <1': {age:0.5},
      'pregnant': {age:30, pregnant:true},
      'breastfeeding': {age:30, breastfeeding:true}
    };
    return map[payload.who] || {age:null};
  }

  function appliesOption(option, details){
    const cautions = [];
    let ok = true;
    const limits = option.age_limits || {};
    if(details.age != null){
      if(limits.min_years != null && details.age < limits.min_years){
        ok = false; cautions.push(`Not for under ${limits.min_years} years.`);
        if(limits.note) cautions.push(limits.note);
      }
      if(limits.max_years != null && details.age > limits.max_years){
        ok = false; cautions.push(`Not for over ${limits.max_years} years.`);
        if(limits.note) cautions.push(limits.note);
      }
    }
    if(option.pregnancy && details.pregnant){
      if(option.pregnancy.suitability === 'avoid'){ ok=false; }
      if(option.pregnancy.note) cautions.push(option.pregnancy.note);
      else cautions.push('Check suitability in pregnancy.');
    }
    if(option.breastfeeding && details.breastfeeding){
      if(option.breastfeeding.suitability === 'avoid'){ ok=false; }
      if(option.breastfeeding.note) cautions.push(option.breastfeeding.note);
      else cautions.push('Check suitability while breastfeeding.');
    }
    // Basic contraindication & interaction surfacing (non-clinical demo)
    if(option.contraindications && option.contraindications.length){
      cautions.push(...option.contraindications.map(c=>`Avoid / caution: ${c}`));
    }
    return {ok, cautions};
  }

  function applyGlobalRules(option, details, payload){
    const cautions = [];
    let ok = true;
    if(!dataset || !dataset.global_rules) return {ok, cautions};
    const medsText = (payload.meds || '').toLowerCase();
    const condText = (payload.answers?.conditions || '').toLowerCase();
    for(const rule of dataset.global_rules){
      if(!rule.applies_to.includes(option.class_id) &&
         !(option.members_examples||[]).some(m=> rule.applies_to.includes((m.split(' ')[0]||'').toLowerCase()))) continue;
      const c = rule.criteria || {};
      if(c.age_lt_years != null && details.age != null && details.age < c.age_lt_years){ ok=false; cautions.push(rule.reason); }
      if(c.pregnant && details.pregnant){ ok=false; cautions.push(rule.reason); }
      if(c.breastfeeding && details.breastfeeding){ ok=false; cautions.push(rule.reason); }
      if(c.meds_any && c.meds_any.some(x=> medsText.includes(x))){ ok=false; cautions.push(rule.reason); }
      if(c.conditions_any && c.conditions_any.some(x=> condText.includes(x))){ ok=false; cautions.push(rule.reason); }
    }
    return {ok, cautions};
  }

  function checkRedFlags(condition, answers){
    const flags = [];
    if(!condition.red_flags) return flags;
    for(const rf of condition.red_flags){
      if(answers && answers[rf.id]) flags.push(rf.text);
    }
    return flags;
  }

  function evaluate(payload){
    console.log('Engine evaluating payload:', payload);
    if(loadingError){
      return {title:'', advice:[], selfCare:[], cautions:['Data failed to load'], flags:[], error:String(loadingError)};
    }
    if(!dataset) {
      console.warn('Dataset not loaded yet');
      return {title:'', advice:[], selfCare:[], cautions:['Data not loaded'], flags:[]};
    }

    const condId = condMap[payload.condition];
    console.log('Mapped condition ID:', condId);
    const condition = dataset.conditions.find(c=> c.id === condId);
    if(!condition) {
      console.warn('Condition not found:', condId);
      return {title:'', advice:[], selfCare:[], cautions:['Condition not found'], flags:[]};
    }

    const details = getDetails(payload);
    console.log('Patient details:', details);
    const advice = [], cautions = [], flags = checkRedFlags(condition, payload.answers);
    const optionTraces = []; // collect per-option eligibility reasoning
    const rationaleMap = {}; // medicationName -> rationale bullets

    // Normalise list of things already tried / currently taken for filtering
    const triedText = `${payload.action||''} ${payload.meds||''}`.toLowerCase();
    const alreadyTried = new Set();
    triedText.split(/[,;]+| and |\s+/).map(s=>s.trim()).filter(Boolean).forEach(tok=> alreadyTried.add(tok));

    for(const option of condition.options || []){
      const trace = { option: option.class_name, included:false, reasons:[], excluded:[] };
      const localCautions = [];

      const suitability = appliesOption(option, details);
      if(suitability.cautions?.length){
        suitability.cautions.filter(Boolean).forEach(c => {
          localCautions.push(c);
          trace.reasons.push(c);
        });
      }
      let eligible = true;
      if(!suitability.ok){
        eligible = false;
        trace.excluded.push('Age/pregnancy/breastfeeding limits');
      } else {
        trace.reasons.push('Age & pregnancy/breastfeeding suitability passed');
      }

      const ruleCheck = applyGlobalRules(option, details, payload);
      if(ruleCheck.cautions?.length){
        ruleCheck.cautions.filter(Boolean).forEach(c => {
          localCautions.push(c);
          trace.reasons.push(c);
        });
      }
      if(!ruleCheck.ok){
        eligible = false;
        trace.excluded.push('Global safety rule');
      } else {
        trace.reasons.push('Global safety rules satisfied');
      }

      const medicationName = option.example_products?.[0] || option.class_name;
      const nameTokens = [medicationName, option.class_name, ...(option.members_examples||[])];
      const previouslyUsed = nameTokens.some(n=>{
        const low = (n||'').toLowerCase().split(/\s+/)[0];
        return alreadyTried.has(low) || triedText.includes(low);
      });
      if(previouslyUsed){
        eligible = false;
        const msg = `Already reported using ${option.class_name || medicationName}; avoid duplicate dosing.`;
        localCautions.push(msg);
        trace.reasons.push(msg);
        trace.excluded.push('Already in use');
      }

      if(eligible){
        trace.included = true;
        trace.reasons.push('Not previously tried');
        trace.reasons.push(option.typical_use ? `Typical use: ${option.typical_use}` : 'Typical use aligns with condition');
        if(option.age_limits?.note){
          trace.reasons.push(`Age guidance: ${option.age_limits.note}`);
        }
        if(option.why) trace.reasons.push(...option.why.map(w=>'Why: '+w));
        if(option.dose_adult) trace.reasons.push('Adult dose reference included');
        rationaleMap[medicationName] = trace.reasons.slice();
        console.log('Adding medication:', medicationName, 'from option:', option);
        advice.push(medicationName);
      } else {
        trace.included = false;
      }

      cautions.push(...localCautions);
      optionTraces.push(trace);
    }
    console.log('Raw advice list:', advice);

    const uniq = arr => Array.from(new Set(arr.filter(Boolean)));

    // Per-medication details (kept as-is, but now our top-level carries richer counselling)
  const enhancedAdvice = advice.map(medName => {
      const option = condition.options.find(opt =>
        opt.example_products?.[0] === medName || opt.class_name === medName
      );
      const pediatric = Array.isArray(option?.pediatric_dosing) ? option.pediatric_dosing : [];
      const ageLimits = option?.age_limits || null;
      return {
        name: String(medName),
        ingredient: option?.active_ingredient || 'Various active ingredients',
        description: option?.description || 'Follow package instructions carefully',
        dosage: option?.dosage_note || 'As directed on package',
        ageLimits,
        pediatric,
        rationale: rationaleMap[medName] || [],
        usage: [
          'Take exactly as directed on the package',
          'Do not exceed the recommended dose',
          option?.usage_note || 'Follow timing instructions on package',
          'Space doses evenly throughout the day',
          'Take with plenty of water',
          option?.with_food ? 'Take with or after food' : 'Can be taken with or without food',
          'Complete the full course if prescribed'
        ].filter(Boolean),
        instructions: [
          'Read the enclosed leaflet carefully before taking',
          'Check the expiry date before use',
          'Do not use if seal is broken',
          'Store in a cool, dry place away from direct sunlight',
          'Keep out of reach of children',
          'Do not share your medication with others',
          'Return any unused medication to a pharmacy'
        ],
        whenToTake: [
          'Take at regular intervals as prescribed',
          'Try to take at the same time each day',
          option?.timing_note || 'Follow package timing instructions',
          'Set reminders to help maintain regular dosing'
        ].filter(Boolean),
        sideEffects: [
          'Stop use and seek medical attention if you experience any allergic reactions',
          'Common side effects may include: ' + (option?.common_side_effects || 'refer to package leaflet'),
          'Report any unexpected side effects to your healthcare provider'
        ]
      };
    });

    // Condition-specific self-care (kept)
    const selfCareAdvice = [...(condition.default_self_care || [])];
    if (condition.id === 'headache-simple') {
      selfCareAdvice.push('Rest in a quiet, dark room','Stay hydrated by drinking plenty of water','Try to maintain regular sleep patterns','Consider stress management techniques');
    } else if (condition.id === 'allergic-rhinitis') {
      selfCareAdvice.push('Keep windows closed during high pollen times','Shower and change clothes after being outdoors','Use air purifiers if possible','Monitor pollen forecasts');
    }

    // NEW: map counselling JSON to the outgoing fields your UI already expects
    const pc = condition.patient_counselling || {};
    const counsellingOut = {
      when_to_take: pc.when_to_take || [],
      how_to_take_properly: pc.how_to_take_properly || [],
      how_to_store: pc.how_to_store || [],
      what_side_effects_to_watch_for: pc.what_side_effects_to_watch_for || [],
      important_safety_considerations: pc.important_safety_considerations || [],
      general_medication_administration_guidelines: pc.general_medication_administration_guidelines || []
    };

    // Merge into legacy fields so nothing breaks
    const generalTiming = counsellingOut.when_to_take.length ? counsellingOut.when_to_take : [
      'Always follow the prescribed dosing schedule',
      'Set up a routine to help remember when to take your medication',
      'Use medication reminders or alarms if needed',
      'Keep track of when you take each dose'
    ];

    const administration = counsellingOut.how_to_take_properly.length ? counsellingOut.how_to_take_properly : [
      'Take each dose with a full glass of water',
      'Swallow tablets/capsules whole unless instructed otherwise',
      'Do not crush or break tablets unless specifically told to do so',
      'Measure liquid medications carefully using the provided measuring device'
    ];

    const storage = counsellingOut.how_to_store.length ? counsellingOut.how_to_store : [
      'Keep all medicines out of sight and reach of children',
      'Store in a cool, dry place away from direct sunlight',
      'Keep medications in their original containers',
      'Do not store in bathroom cabinets due to heat and moisture'
    ];

    const warnings = uniq([
      'Stop use and consult your doctor if symptoms persist',
      'Do not exceed the stated dose',
      'Seek immediate medical attention if you experience any severe reactions',
      'Contact your healthcare provider if symptoms worsen',
      ...cautions,
      ...counsellingOut.important_safety_considerations,
      ...counsellingOut.what_side_effects_to_watch_for
    ]);

    // Escalation guidance: if red flags OR no suitable OTC options left
    const escalation = [];
    if(flags.length){
      escalation.push('One or more red flag features were indicated. Seek urgent medical advice (NHS 111, GP, or A&E per severity).');
    }
    if(!advice.length && !flags.length){
      escalation.push('No suitable over-the-counter options identified based on age/pregnancy/previous use; seek pharmacist or GP advice.');
    }
    if(payload.duration && /Recurrent|> 7 days|14/i.test(payload.duration) && !flags.length){
      escalation.push('Persistent or recurrent symptoms—consider GP/111 review.');
    }
    if(escalation.length){
      warnings.push(...escalation);
    }

  return {
      title: condition.name,
      advice: enhancedAdvice,
      selfCare: uniq(selfCareAdvice),
      cautions: uniq(cautions),
      flags: uniq(flags),

      // legacy fields populated from counselling JSON
      generalTiming,
      administration,
      storage,
      warnings,
  escalation,

      // NEW: expose the full structured counselling block too
      patientCounselling: counsellingOut,
      trace: {
        condition: condition.id,
        steps: [
          `Mapped user condition '${payload.condition}' to dataset id '${condition.id}'`,
          `Derived patient profile: age=${details.age ?? 'unknown'}${details.pregnant?' pregnant':''}${details.breastfeeding?' breastfeeding':''}`,
          `${flags.length? flags.length+' red flag(s) detected':'No dataset red flags triggered by structured answers'}`,
          `${advice.length} option(s) included, ${optionTraces.filter(o=>!o.included).length} excluded`
        ],
        options: optionTraces
      }
    };
  }

  function getConditionMeta(key){
    if(!dataset) return null;
    const condId = condMap[key];
    if(!condId) return null;
    return dataset.conditions.find(c=> c.id === condId) || null;
  }

  const EngineAPI = { evaluate, getConditionMeta, ready };
  global.Engine = EngineAPI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
