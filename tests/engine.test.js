import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Response } from 'node-fetch';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const originalFetch = global.fetch;
let Engine;

beforeAll(async () => {
  global.fetch = async resource => {
    const filePath = path.resolve(publicDir, resource);
    const data = await readFile(filePath, 'utf8');
    return new Response(data, { status: 200 });
  };
  const require = createRequire(import.meta.url);
  require('../public/js/modules/engine.js');
  Engine = global.Engine;
  await Engine.ready();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('Medication engine clinical pathways', () => {
  it('recommends paediatric-safe analgesics for children with headache', () => {
    const result = Engine.evaluate({
      condition: 'headache',
      who: 'child 5–12',
      what: 'throbbing head pain',
      duration: '1-3 days',
      action: 'rest',
      meds: '',
      answers: {}
    });

    const paracetamol = result.advice.find(item => /paracetamol/i.test(item.name));
    expect(paracetamol).toBeTruthy();
    expect(paracetamol.pediatric?.length || 0).toBeGreaterThan(0);
    expect(paracetamol.ageLimits?.min_years).toBeLessThan(1);
  });

  it('includes nasal care advice for children with common cold symptoms', () => {
    const result = Engine.evaluate({
      condition: 'commoncold',
      who: 'child 5–12',
      what: 'blocked nose and cough',
      duration: '4-7 days',
      action: 'steamy bathroom',
      meds: '',
      answers: {}
    });

    const saline = result.advice.find(item => /saline/i.test(item.name));
    expect(saline).toBeTruthy();
    const nasalSpray = result.advice.find(item => /nasal/i.test(item.name));
    expect(nasalSpray?.pediatric?.length || 0).toBeGreaterThan(0);
  });

  it('maps constipation pathway and surfaces macrogol guidance for teens', () => {
    const meta = Engine.getConditionMeta('constipation');
    expect(meta?.id).toBe('constipation');

    const result = Engine.evaluate({
      condition: 'constipation',
      who: 'teen 13–17',
      what: 'hard stools',
      duration: '4-7 days',
      action: 'increase fibre',
      meds: '',
      answers: {}
    });

    const macrogol = result.advice.find(item => /macrogol/i.test(item.name));
    expect(macrogol).toBeTruthy();
    expect(macrogol.pediatric?.length || 0).toBeGreaterThan(0);
  });

  it('surfaces duplicate and interaction cautions together for oral decongestants', () => {
    const result = Engine.evaluate({
      condition: 'commoncold',
      who: 'adult',
      what: 'blocked nose and congestion',
      duration: '4-7 days',
      action: 'Pseudoephedrine tablets',
      meds: 'MAOI treatment',
      answers: {}
    });

    expect(result.advice.find(item => /Pseudoephedrine/i.test(item.name))).toBeFalsy();
    expect(result.cautions).toEqual(expect.arrayContaining([
      'Already reported using Oral decongestant; avoid duplicate dosing.',
      'Avoid sympathomimetic decongestants with monoamine oxidase inhibitors.'
    ]));

    const traceEntry = result.trace.options.find(opt => opt.option === 'Oral decongestant');
    expect(traceEntry?.reasons).toEqual(expect.arrayContaining([
      'Already reported using Oral decongestant; avoid duplicate dosing.',
      'Avoid sympathomimetic decongestants with monoamine oxidase inhibitors.'
    ]));
    expect(traceEntry?.included).toBe(false);
  });
});
