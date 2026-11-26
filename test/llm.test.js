import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickGroqModel } from '../src/llm.js';

test('при снятой модели Groq берётся следующая доступная', () => {
  assert.equal(pickGroqModel(['whisper-large-v3', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'], 'openai/gpt-oss-120b'), 'qwen/qwen3.8-27b');
  assert.equal(pickGroqModel(['whisper-large-v3'], 'openai/gpt-oss-120b'), null);
});
