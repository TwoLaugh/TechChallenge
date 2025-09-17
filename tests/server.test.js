import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, clearQueuedContacts, getQueuedContacts } from '../server/index.js';

describe('server contact endpoint', () => {
  beforeEach(() => {
    clearQueuedContacts();
  });

  it('accepts a valid enquiry and forwards payload', async () => {
    const forwarded = [];
    const app = createApp({
      contactForwarder: async payload => {
        forwarded.push(payload);
      }
    });

    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        reason: 'Feedback',
        contact_pref: 'email',
        message: 'Hello team',
        consent: true
      });

    expect(res.status).toBe(202);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].name).toBe('Test User');
  });

  it('rejects submissions without consent', async () => {
    const app = createApp({ contactForwarder: async () => {} });
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'No Consent',
        email: 'noconsent@example.com',
        contact_pref: 'email',
        message: 'Hi',
        consent: false
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/consent/i);
  });

  it('queues contact messages when no forwarder configured', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Queue User',
        email: 'queue@example.com',
        contact_pref: 'email',
        message: 'Keep in touch',
        consent: true
      });

    expect(res.status).toBe(202);
    const queued = getQueuedContacts();
    expect(queued.length).toBeGreaterThan(0);
    expect(queued[queued.length - 1].name).toBe('Queue User');
  });
});

describe('server llm proxy endpoint', () => {
  it('falls back to local summary when no API key configured', async () => {
    const app = createApp({ openAiKey: null });
    const res = await request(app)
      .post('/api/llm')
      .send({ prompt: 'Summarise please', engineResult: { title: 'Headache guidance' } });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('local');
    expect(res.body.text).toContain('Headache guidance');
  });

  it('validates prompt input', async () => {
    const app = createApp();
    const res = await request(app).post('/api/llm').send({});
    expect(res.status).toBe(400);
  });
});
