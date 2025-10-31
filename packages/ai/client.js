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
    model = 'gpt-3.5-turbo',
    temperature = 0.3,
    maxTokens = 500,
  } = options;

  const response = await aiClient.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content || '';
}
