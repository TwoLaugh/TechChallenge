require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const contactQueue = [];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitiseEngine(engineResult = {}) {
  return {
    title: engineResult?.title?.toString?.().slice(0, 200) || '',
    advice: Array.isArray(engineResult?.advice)
      ? engineResult.advice.slice(0, 6).map(item => ({
          name: (item?.name || '').toString().slice(0, 120),
          dosage: (item?.dosage || '').toString().slice(0, 160),
          description: (item?.description || '').toString().slice(0, 240)
        }))
      : [],
    flags: Array.isArray(engineResult?.flags)
      ? engineResult.flags.slice(0, 6).map(flag => flag.toString().slice(0, 240))
      : [],
    cautions: Array.isArray(engineResult?.cautions)
      ? engineResult.cautions.slice(0, 6).map(flag => flag.toString().slice(0, 240))
      : [],
    generalTiming: Array.isArray(engineResult?.generalTiming)
      ? engineResult.generalTiming.slice(0, 6).map(item => item.toString().slice(0, 240))
      : [],
    administration: Array.isArray(engineResult?.administration)
      ? engineResult.administration.slice(0, 6).map(item => item.toString().slice(0, 240))
      : [],
    storage: Array.isArray(engineResult?.storage)
      ? engineResult.storage.slice(0, 6).map(item => item.toString().slice(0, 240))
      : [],
    warnings: Array.isArray(engineResult?.warnings)
      ? engineResult.warnings.slice(0, 6).map(item => item.toString().slice(0, 240))
      : [],
    selfCare: Array.isArray(engineResult?.selfCare)
      ? engineResult.selfCare.slice(0, 6).map(item => item.toString().slice(0, 240))
      : []
  };
}

function summariseLocally(engineResult = {}) {
  const lines = [];
  if (engineResult.title) {
    lines.push(`<p><strong>${engineResult.title}</strong></p>`);
  }
  if (engineResult.advice?.length) {
    lines.push('<p>Recommended options:</p><ul>');
    engineResult.advice.forEach(item => {
      const desc = item.description ? ` — ${item.description}` : '';
      const dose = item.dosage ? ` (<em>${item.dosage}</em>)` : '';
      lines.push(`<li>${item.name || 'Medication'}${dose}${desc}</li>`);
    });
    lines.push('</ul>');
  }
  if (engineResult.flags?.length) {
    lines.push('<p><strong>Safety flags:</strong></p><ul>');
    engineResult.flags.forEach(flag => lines.push(`<li>${flag}</li>`));
    lines.push('</ul>');
  }
  if (engineResult.warnings?.length) {
    lines.push('<p><strong>Warnings:</strong></p><ul>');
    engineResult.warnings.forEach(flag => lines.push(`<li>${flag}</li>`));
    lines.push('</ul>');
  }
  if (!lines.length) {
    lines.push('<p>No additional summary available. Please review the full guidance above.</p>');
  }
  return { text: lines.join('') };
}

function normaliseContact(body = {}) {
  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const message = (body.message || '').toString().trim();
  const reason = (body.reason || '').toString().trim();
  const contactPref = (body.contact_pref || '').toString().trim();
  const consent = Boolean(body.consent);

  if (!name) throw new Error('Name is required');
  if (!email || !EMAIL_RE.test(email)) throw new Error('Valid email is required');
  if (!message) throw new Error('Message cannot be empty');
  if (!contactPref) throw new Error('Contact preference is required');
  if (contactPref === 'phone' && !phone) throw new Error('Phone number required for phone contact');
  if (!consent) throw new Error('Consent to contact is required');

  return {
    name,
    email,
    phone: phone || null,
    reason: reason || null,
    contactPref,
    message,
    consent,
    receivedAt: new Date().toISOString()
  };
}

function buildContactForwarder(config) {
  if (typeof config.contactForwarder === 'function') {
    return config.contactForwarder;
  }
  if (config.contactWebhook) {
    return async payload => {
      const res = await fetch(config.contactWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          forwardedAt: new Date().toISOString(),
          source: 'pharmalogic-contact-form'
        })
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Webhook responded with status ${res.status}${detail ? `: ${detail}` : ''}`);
      }
    };
  }
  return async payload => {
    contactQueue.push(payload);
  };
}

function createApp(overrides = {}) {
  const app = express();
  const env = overrides.env || process.env;
  const config = {
    allowedOrigin: overrides.allowedOrigin ?? env.ALLOWED_ORIGIN ?? '*',
    openAiKey: overrides.openAiKey ?? env.OPENAI_API_KEY ?? null,
    openAiBaseUrl: overrides.openAiBaseUrl ?? env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    contactWebhook: overrides.contactWebhook ?? env.CONTACT_WEBHOOK_URL ?? null,
    contactForwarder: overrides.contactForwarder
  };

  const forwardContact = buildContactForwarder(config);

  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.allowedOrigin);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  app.post('/api/contact', async (req, res) => {
    try {
      const payload = normaliseContact(req.body || {});
      await forwardContact(payload, req);
      res.status(202).json({ message: 'Thanks – your enquiry has been queued for a pharmacist to review.' });
    } catch (err) {
      const status = err.message && /required|valid email/i.test(err.message) ? 400 : 502;
      res.status(status).json({ error: err.message || 'Unable to forward message' });
    }
  });

  app.post('/api/llm', async (req, res) => {
    const { prompt, engineResult } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing prompt' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt too long' });
    }

    const safeEngine = sanitiseEngine(engineResult);

    if (!config.openAiKey) {
      const local = summariseLocally(safeEngine);
      return res.json({ ...local, provider: 'local', note: 'LLM provider not configured; using rule-based summary.' });
    }

    const systemPrompt = 'You are a harmless summarisation assistant. Produce a short HTML summary and optional medHtml strictly using the provided engineResult. Do not add new medical recommendations beyond the engineResult. If engineResult contains flags, emphasise them and do not output medHtml.';
    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Prompt: ${prompt}\n\nEngineResult: ${JSON.stringify(safeEngine)}` }
      ],
      max_tokens: 512
    };

    try {
      const response = await fetch(`${config.openAiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openAiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return res.status(502).json({ error: 'Provider error', detail });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      return res.json({ text: content, provider: 'openai' });
    } catch (err) {
      console.error('Proxy LLM error', err);
      return res.status(500).json({ error: 'Proxy failed', detail: String(err) });
    }
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3001;
  const app = createApp();
  app.listen(port, () => {
    console.log(`LLM proxy listening on ${port}`);
  });
}

module.exports = {
  createApp,
  getQueuedContacts: () => contactQueue.slice(),
  clearQueuedContacts: () => {
    contactQueue.length = 0;
  }
};
