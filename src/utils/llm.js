import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const OPENAI_MODEL = 'gpt-4o-mini';

/**
 * Detects which LLM provider to use based on environment variables.
 * Checks OPENAI_API_KEY first, then ANTHROPIC_API_KEY.
 * @returns {{ provider: 'openai'|'anthropic', client: object, model: string }}
 */
export function getLLMClient() {
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      client: new OpenAI(),
      model: OPENAI_MODEL,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      client: new Anthropic(),
      model: ANTHROPIC_MODEL,
    };
  }

  throw new Error(
    'No LLM API key found. Set one of:\n' +
    '  export OPENAI_API_KEY=sk-...\n' +
    '  export ANTHROPIC_API_KEY=sk-ant-...'
  );
}

/**
 * Sends a prompt to the configured LLM provider and returns the text response.
 * @param {{ provider: string, client: object, model: string }} llm - From getLLMClient()
 * @param {string} prompt - The user prompt to send
 * @param {number} [maxTokens=4096] - Max tokens in response
 * @returns {Promise<string>} The text response from the model
 */
export async function chatCompletion(llm, prompt, maxTokens = 4096) {
  if (llm.provider === 'openai') {
    const response = await llm.client.chat.completions.create({
      model: llm.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices?.[0]?.message?.content?.trim() ?? '';
  }

  if (llm.provider === 'anthropic') {
    const response = await llm.client.messages.create({
      model: llm.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content?.[0]?.text?.trim() ?? '';
  }

  throw new Error(`Unknown LLM provider: ${llm.provider}`);
}

/**
 * Returns true if any supported LLM API key is set.
 * @returns {boolean}
 */
export function hasApiKey() {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}
