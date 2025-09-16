require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Allow cross-origin requests from static front-end servers during development
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Simple health
app.get('/health', (req, res) => res.json({ok:true, time: Date.now()}));

// POST /api/llm
// Body: { prompt: string, engineResult: object }
// This proxy sanitises and forwards prompt to a configured LLM provider (OpenAI example).
app.post('/api/llm', async (req, res) => {
  const { prompt, engineResult } = req.body || {};
  if(!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  if(prompt.length > 2000) return res.status(400).json({ error: 'Prompt too long' });

  // If no provider configured, return 501 so client can fallback to local synthesis
  const key = process.env.OPENAI_API_KEY;
  if(!key) return res.status(501).json({ error: 'LLM provider not configured on server' });

  // Minimal safety filter: do not allow free-form clinical instructions to be modified.
  // Allowlist engineResult fields and limit sizes to avoid injection and token blowup.
  const safeEngine = {
    title: engineResult?.title?.toString?.().slice(0,200) || '',
    advice: Array.isArray(engineResult?.advice) ? engineResult.advice.slice(0,6).map(a=>({ name: (a.name||'').toString().slice(0,120), dosage: (a.dosage||'').toString().slice(0,100), description: (a.description||'').toString().slice(0,240) })) : [],
    flags: Array.isArray(engineResult?.flags) ? engineResult.flags.slice(0,6).map(f=>f.toString().slice(0,240)) : [],
    cautions: Array.isArray(engineResult?.cautions) ? engineResult.cautions.slice(0,6).map(c=>c.toString().slice(0,240)) : [],
    generalTiming: Array.isArray(engineResult?.generalTiming) ? engineResult.generalTiming.slice(0,6).map(i=>i.toString().slice(0,240)) : [],
    administration: Array.isArray(engineResult?.administration) ? engineResult.administration.slice(0,6).map(i=>i.toString().slice(0,240)) : [],
    storage: Array.isArray(engineResult?.storage) ? engineResult.storage.slice(0,6).map(i=>i.toString().slice(0,240)) : [],
    warnings: Array.isArray(engineResult?.warnings) ? engineResult.warnings.slice(0,6).map(i=>i.toString().slice(0,240)) : [],
    selfCare: Array.isArray(engineResult?.selfCare) ? engineResult.selfCare.slice(0,6).map(i=>i.toString().slice(0,240)) : []
  };

  const system = `You are a harmless summarisation assistant. Produce a short HTML summary and optional medHtml strictly using the provided engineResult. Do not add new medical recommendations beyond the engineResult. If engineResult contains flags, emphasise them and do not output medHtml.`;
  const userMessage = `Prompt: ${prompt}\n\nEngineResult: ${JSON.stringify(safeEngine)}`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{role:'system',content:system},{role:'user',content:userMessage}], max_tokens: 512 })
    });
    if(!r.ok){
      const err = await r.text();
      return res.status(502).json({ error: 'Provider error', detail: err });
    }
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || '';
    // The server trusts the model output only for presentation. Client must postProcess.
    return res.json({ text: content });
  } catch(err){
    console.error('Proxy LLM error', err);
    return res.status(500).json({ error: 'Proxy failed', detail: String(err) });
  }
});

app.listen(port, () => console.log(`LLM proxy listening on ${port}`));
