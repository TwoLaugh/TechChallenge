/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let chatInternals;
let originalFetch;
let analyzeMock;

beforeAll(async () => {
  vi.useFakeTimers();

  document.body.innerHTML = `
    <div id="messages"></div>
    <form id="composer">
      <div id="quick-row"></div>
      <label for="input">Input</label>
      <textarea id="input"></textarea>
      <button id="send" type="submit">Send</button>
    </form>
    <button id="restart" type="button"></button>
  `;

  originalFetch = global.fetch;
  global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));

  window.Engine = {
    evaluate: vi.fn(() => ({
      title: 'Test',
      advice: [],
      selfCare: [],
      flags: [],
      cautions: []
    })),
    ready: vi.fn(() => Promise.resolve()),
    getConditionMeta: vi.fn(() => ({ options: [] }))
  };

  analyzeMock = vi.fn(() => ({}));
  window.NLU = { analyze: analyzeMock };
  window.StateManager = { saveCheckState: vi.fn(), clearState: vi.fn() };

  const chatScriptPath = path.resolve(__dirname, '../public/js/pages/chat.js');
  const chatScript = await readFile(chatScriptPath, 'utf8');
  const run = new Function('window', 'document', chatScript);
  run(window, document);

  chatInternals = window.ChatInternals;
  vi.runAllTimers();
  vi.useRealTimers();
});

beforeEach(() => {
  if (typeof global.fetch === 'function' && 'mockClear' in global.fetch) {
    global.fetch.mockClear();
  }
  if (window.Engine?.evaluate?.mockClear) {
    window.Engine.evaluate.mockClear();
  }
  analyzeMock.mockReset();
  analyzeMock.mockReturnValue({});
  chatInternals.resetState();
  const messages = document.getElementById('messages');
  if (messages) messages.innerHTML = '';
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('chat analyseMessage edge cases', () => {
  it('treats nonsense input as empty signal', () => {
    const analysis = chatInternals.analyzeMessage('asdf qwerty zxcv lorem');
    expect(analysis.condition).toBeNull();
    expect(analysis.duration).toBeNull();
    expect(analysis.who).toBeNull();
    expect(analysis.action).toBeNull();
    expect(analysis.meds).toBeNull();
    expect(analysis.redFlags).toEqual([]);
  });

  it('detects immediate red flags from catastrophic descriptions', () => {
    const analysis = chatInternals.analyzeMessage('My father collapsed and is vomiting lots of blood right now.');
    expect(analysis.redFlags).toContain('Bleeding symptoms mentioned.');
    expect(analysis.redFlags).toContain('Possible emergency symptoms mentioned.');
  });

  it('normalises structured red flags returned by heuristic NLU helper', () => {
    analyzeMock.mockReturnValue({ redFlags: ['vomit(ing)? blood'] });
    const analysis = chatInternals.analyzeMessage('');
    expect(analysis.redFlags).toContain('Mentioned blood in vomit or stool.');
  });

  it('avoids misclassification when response does not match requested slot', () => {
    const value = chatInternals.fillSlotFromText('I just took two paracetamol tablets.', 'duration');
    expect(value).toBeNull();
  });

  it('captures negative medication statements for the meds slot', () => {
    const value = chatInternals.fillSlotFromText('No other medications at all.', 'meds');
    expect(value).toBe('none');
  });
});

describe('chat safety evaluation escalation paths', () => {
  beforeEach(() => {
    chatInternals.resetState();
  });

  it('raises condition-specific flags for severe headache symptoms', () => {
    chatInternals.state.condition = 'headache';
    chatInternals.evaluateSafety('This is the worst ever headache with confusion and vision problems.');
    expect(chatInternals.state.flags).toContain('Headache red flags — seek urgent advice (pharmacist/GP/111).');
  });

  it('adds general emergency warning when chest pain and breathing difficulty described', () => {
    chatInternals.evaluateSafety('He cannot breathe, has crushing chest pain, and is vomiting blood.');
    expect(chatInternals.state.flags).toContain('Emergency symptoms — call 999 or go to A&E immediately.');
  });

  it('ignores calm filler text without adding unnecessary flags', () => {
    chatInternals.evaluateSafety('Just checking in, nothing major to report besides feeling fine.');
    expect(chatInternals.state.flags).toEqual([]);
  });
});
