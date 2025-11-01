import OpenAI from 'openai';

let client = null;

/**
 * Initialize AI client
 */
export function initializeAI(apiKey, baseURL = null) {
  const config = {
    apiKey,
  };
  
  if (baseURL) {
    config.baseURL = baseURL;
  }
  
  client = new OpenAI(config);
  return client;
}

/**
 * Get or create AI client
 */
export function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    initializeAI(apiKey);
  }
  return client;
}

/**
 * Call OpenAI chat completion
 */
export async function complete(messages, options = {}) {
  const aiClient = getClient();
  
  const {
    model = 'gpt-4o-mini', // Fast, cheap, and much better than gpt-3.5-turbo
    temperature = 0.3,
    maxTokens = 500,
    response_format = undefined,
  } = options;

  const requestParams = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  // Only add response_format if specified (requires compatible models)
  if (response_format) {
    requestParams.response_format = response_format;
  }

  const response = await aiClient.chat.completions.create(requestParams);

  return response.choices[0]?.message?.content || '';
}

/**
 * Structured completion using Responses API (preferred for JSON reliability)
 * Falls back to legacy chat completion if responses API not available
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} options - { model, temperature, maxTokens, schema }
 * @returns {Promise<string>} raw JSON string content
 */
export async function structuredComplete(messages, options = {}) {
  const aiClient = getClient();
  const {
    model = 'gpt-4o-mini',
    temperature = 0.2,
    maxTokens = 500,
    schema = null, // JSON schema for structured output
  } = options;

  // Transform chat messages into array of content parts for responses API
  const input = messages.map(m => ({ role: m.role, content: m.content }));

  // Try Responses API first
  try {
    if (aiClient.responses?.create) {
      const response = await aiClient.responses.create({
        model,
        temperature,
        max_output_tokens: maxTokens,
        // For newer SDK versions, 'input' is a single string or array of messages.
        // We'll pass messages as an array as supported by recent versions.
        input,
        response_format: schema ? { type: 'json_schema', json_schema: { name: 'structured_output', schema } } : undefined,
      });

      // New Responses API returns content array; find text segments
      const parts = response?.output ?? response?.content ?? [];
      const text = parts
        .map(p => (typeof p === 'string' ? p : p?.text || p?.content || p?.data?.[0]?.text || ''))
        .filter(Boolean)
        .join('\n');
      if (text.trim()) return text.trim();
    }
  } catch (err) {
    console.warn('[structuredComplete] Responses API failed, falling back to chat completions:', err.message);
    console.warn('If this persists, ensure your openai npm package is >= 4.55.0 and you have access to the Responses API.');
  }

  // Fallback to legacy chat completion
  try {
    const chatResponse = await complete(messages, { model, temperature, maxTokens, response_format: schema ? { type: 'json_object' } : undefined });
    return chatResponse;
  } catch (err) {
    console.error('[structuredComplete] Fallback chat completion failed:', err.message);
    throw err;
  }
}

/**
 * Attempt to parse robust JSON; repairs minor issues.
 * @param {string} raw
 * @returns {object|null}
 */
export function safeParseJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  // Strip code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/,'').trim();
  }
  // Remove leading/trailing junk before first '{' or '[' and after last '}' or ']'
  const firstBrace = Math.min(...['{','['].map(ch => cleaned.indexOf(ch)).filter(i => i >= 0));
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  // Find last matching closing brace/bracket
  const lastObj = cleaned.lastIndexOf('}');
  const lastArr = cleaned.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (last > 0) cleaned = cleaned.slice(0, last + 1);

  // Simple repairs: ensure keys quoted (basic heuristic) – skip if looks fine
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Heuristic fixes
    let repaired = cleaned
      .replace(/\r\n/g,'\n')
      .replace(/,(\s*[}\]])/g,'$1') // trailing commas
      .replace(/"{2,}/g,'"');
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      console.warn('safeParseJSON failed:', e2.message, 'raw snippet:', cleaned.substring(0,200));
      return null;
    }
  }
}
