// Lightweight heuristic NLU module (client-side only)
// NOTE: This is NOT a substitute for a real language model; it enriches
// extraction beyond simple regex with token normalisation, fuzzy matching,
// negation detection, and medication/action harvesting from the dataset.

(function(){
  const NORMALISE = txt => (txt||'').toLowerCase();

  // Basic tokenisation
  function tokens(text){
    return NORMALISE(text).split(/[^a-z0-9+]+/).filter(Boolean);
  }

  // Simple edit distance for fuzzy match
  function lev(a,b){
    a=a.toLowerCase(); b=b.toLowerCase();
    const dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++) dp[i][0]=i; for(let j=0;j<=b.length;j++) dp[0][j]=j;
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++){
      dp[i][j]= a[i-1]===b[j-1]? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    }
    return dp[a.length][b.length];
  }

  const WHO_SYNONYMS = [
    {value:'adult', pats:['adult','grown up']},
    {value:'teen 13–17', pats:['teen','teenager','13 year','14 year','15 year','16 year','17 year']},
    {value:'child 5–12', pats:['child','kid','12 year','12-year','11 year','10 year','9 year','8 year','7 year','6 year','5 year']},
    {value:'toddler 1–4', pats:['toddler','3 year','2 year','1 year','4 year']},
    {value:'infant <1', pats:['infant','baby','newborn']},
    {value:'pregnant', pats:['pregnant','pregnancy','expecting']},
    {value:'breastfeeding', pats:['breastfeeding','breast feeding','lactating']}
  ];

  function detectWho(text){
    const t = NORMALISE(text);
    for(const item of WHO_SYNONYMS){
      if(item.pats.some(p=> t.includes(p))) return item.value;
    }
    return null;
  }

  function extractDuration(text){
    const t = NORMALISE(text);
    const numMatch = t.match(/(\d+)\s*(hour|hr|day|week|month)s?/);
    if(numMatch){
      const n = parseInt(numMatch[1]); const unit = numMatch[2];
      if(/hour|hr/.test(unit) || (unit==='day' && n===0)) return '< 24 hours';
      if(unit.startsWith('day') && n === 0) return '< 24 hours';
      if(unit.startsWith('day')){ if(n<=3) return '1–3 days'; if(n<=7) return '4–7 days'; return '> 7 days'; }
      if(unit.startsWith('week')) return n<=1? '4–7 days' : '> 7 days';
      if(unit.startsWith('month')) return '> 7 days';
    }
    if(/yesterday|today only|since last night|last night/.test(t)) return '< 24 hours';
    if(/couple of days|few days|couple days/.test(t)) return '1–3 days';
    if(/about a week|nearly a week|5 days|6 days/.test(t)) return '4–7 days';
    if(/over a week|more than a week|two weeks|2 weeks|fortnight|months?/.test(t)) return '> 7 days';
    if(/recurrent|on and off|keeps? coming back/.test(t)) return 'Recurrent / frequent';
    return null;
  }

  // Condition detection (reuse engine condition map through dataset introspection if available)
  const CONDITION_HINTS = {
    headache:['headache','throbbing','tension','pressure head'],
    hayfever:['hay fever','allerg','sneez','itchy nose','rhinitis','pollen'],
    indigestion:['heartburn','indigestion','acid','reflux','burning chest'],
    diarrhoea:['diarrhoea','diarrhea','loose stool','runs','tummy bug'],
    sorethroat:['sore throat','throat pain','painful swallow','pharyng']
  };

  function detectCondition(text){
    const low = NORMALISE(text);
    // direct includes
    for(const [cond, list] of Object.entries(CONDITION_HINTS)){
      if(list.some(k=> low.includes(k))) return cond;
    }
    // fuzzy single tokens
    const toks = tokens(text);
    for(const [cond,list] of Object.entries(CONDITION_HINTS)){
      for(const tok of toks){
        if(list.some(k=> lev(k.split(' ')[0], tok)<=2)) return cond;
      }
    }
    return null;
  }

  function extractActionsAndMeds(text){
    const low = NORMALISE(text);
    const actions=[]; const meds=[];
    const ACTION_WORDS = ['rest','fluids','sleep','elevated','hydrated','exercise'];
    ACTION_WORDS.forEach(a=>{ if(low.includes(a)) actions.push(a); });
    // Derive medication list from Engine dataset if available
    try {
      const ds = window.Engine?.getConditionMeta && ['headache','hayfever','indigestion','diarrhoea','sorethroat'].map(c=>window.Engine.getConditionMeta(c)).filter(Boolean);
      const known = new Set();
      ds.forEach(cond=> (cond.options||[]).forEach(opt=>{
        if(opt.class_name) known.add(opt.class_name.toLowerCase());
        (opt.example_products||[]).forEach(p=> known.add(p.toLowerCase()));
        (opt.members_examples||[]).forEach(p=> known.add(p.toLowerCase()));
      }));
      low.split(/[,;.!?]/).forEach(fragment=>{
        fragment.split(/\s+/).forEach(tok=>{
          if(known.has(tok)) meds.push(tok);
        });
      });
    } catch {
      // Ignore parsing errors
    }
    return {action: actions.join(', '), meds: meds.join(', ')};
  }

  // Red flag detection (negation naive here; refined can be upstream)
  const RED_FLAG_PATTERNS = [
    /vomiting blood|vomit(?:ing)? blood|blood in (?:stool|poo)/i,
    /black (?:stool|tarry)/i,
    /severe (?:chest|abdominal) pain/i,
    /collapse|unconscious/i,
    /stiff neck|non.?blanching rash/i
  ];

  const NEGATION_WINDOW = /\b(?:no|not|without|never|denies?|absence of)\b(?:[^a-z0-9]+[a-z0-9]+){0,3}$/i;

  function hasAffirmativeMatch(text, pattern){
    if(!text) return false;
    const source = pattern.source;
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const re = new RegExp(source, flags);
    let match;
    while((match = re.exec(text))){
      const start = match.index;
      const prefix = text.slice(Math.max(0, start - 60), start);
      if(!NEGATION_WINDOW.test(prefix.trim())) return true;
    }
    return false;
  }

  function detectRedFlags(text){
    const flags=[]; const low = NORMALISE(text);
    RED_FLAG_PATTERNS.forEach(re=>{ if(hasAffirmativeMatch(low, re)) flags.push(re.source); });
    return flags;
  }

  function analyze(text, _prevState={}){
    const out = {};
    if(!text || !text.trim()) return out;
    out.who = detectWho(text) || null;
    out.duration = extractDuration(text);
    out.condition = detectCondition(text);
    const am = extractActionsAndMeds(text);
    if(am.action) out.action = am.action;
    if(am.meds) out.meds = am.meds;
    out.redFlags = detectRedFlags(text);
    return out;
  }

  window.NLU = { analyze };
})();
