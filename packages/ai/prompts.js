import { complete, structuredComplete, safeParseJSON } from './client.js';

/**
 * Classify email into one of the user's categories
 * @param {object} email - { subject, from, text }
 * @param {array} categories - [{ name, description }]
 * @returns {Promise<{ categoryName: string, confidence: number }>}
 */
export async function classifyEmail(email, categories) {
  if (!categories || categories.length === 0) {
    return { categoryName: 'Uncategorized', confidence: 0 };
  }

  const categoryList = categories
    .map((cat, idx) => `${idx + 1}. ${cat.name}: ${cat.description || 'No description'}`)
    .join('\n');

  const emailContent = `
Subject: ${email.subject || 'No subject'}
From: ${email.from || 'Unknown'}
Content: ${(email.text || email.html || email.snippet || '').substring(0, 1000)}
  `.trim();

  const messages = [
    {
      role: 'system',
      content: `You are an email classification assistant. Classify emails into one of the provided categories. Respond ONLY with valid JSON in this exact format: {"categoryName": "Category Name", "confidence": 0.95}`,
    },
    {
      role: 'user',
      content: `Categories:
${categoryList}

Email to classify:
${emailContent}

Classify this email into the most appropriate category. Return JSON only.`,
    },
  ];

  try {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['categoryName','confidence'],
      properties: {
        categoryName: { type: 'string', minLength: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      }
    };

    let raw = await structuredComplete(messages, { temperature: 0.2, maxTokens: 150, schema });
    let parsed = safeParseJSON(raw);
    if (!parsed) {
      // legacy fallback
      raw = await complete(messages, { temperature: 0.2, maxTokens: 120, response_format: { type: 'json_object' } });
      parsed = safeParseJSON(raw);
    }
    if (parsed && typeof parsed.categoryName === 'string' && typeof parsed.confidence === 'number') {
      const categoryExists = categories.some(cat => cat.name === parsed.categoryName);
      if (categoryExists) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Classification error:', error.message);
  }
  // Fallback to first category
  return { categoryName: categories[0].name, confidence: 0.4 };
}

/**
 * Analyze email and extract unsubscribe information using AI
 * @param {object} email - { subject, from, text, html }
 * @returns {Promise<{ summary: string, unsubscribeUrl: string|null, unsubscribeMailto: string|null }>}
 */
export async function analyzeEmail(email) {
  // Use HTML if available (contains links), otherwise text
  const fullContent = email.html || email.text || email.snippet || '';
  
  // For unsubscribe detection, prioritize the LAST 15000 chars (footer area) + first 3000 chars
  let content = '';
  if (fullContent.length > 18000) {
    const beginning = fullContent.substring(0, 3000);
    const ending = fullContent.substring(fullContent.length - 15000);
    content = beginning + '\n...[middle content omitted]...\n' + ending;
  } else {
    content = fullContent;
  }
  
  const emailContent = `
Subject: ${email.subject || 'No subject'}
From: ${email.from || 'Unknown'}
Content: ${content}
  `.trim();

  const messages = [
    {
      role: 'system',
      content: `You are an email analysis assistant. Analyze emails and extract:
1. A 1-3 sentence summary of the main purpose and action items
2. ANY unsubscribe URL (http/https links) - look VERY CAREFULLY in the footer/bottom
3. ANY unsubscribe mailto address

CRITICAL: Unsubscribe links are almost ALWAYS at the very bottom/footer of emails. Look for:
- ANY link containing "unsubscribe" in the URL or anchor text
- Links with text like "unsubscribe", "opt out", "opt-out", "manage preferences", "stop receiving", "email preferences"
- Footer links near text about "don't want to receive" or "update preferences"
- mailto: links for unsubscribe
- Even if text says "If you don't want to receive" followed by a link

Extract the FULL URL including all parameters. Do NOT return null if you see ANY unsubscribe-related link.

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief 1-3 sentence summary",
  "unsubscribeUrl": "https://example.com/unsubscribe?params=here" or null,
  "unsubscribeMailto": "unsubscribe@example.com" or null
}`,
    },
    {
      role: 'user',
      content: `Analyze this email:\n\n${emailContent}`,
    },
  ];

  try {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['summary','unsubscribeUrl','unsubscribeMailto'],
      properties: {
        summary: { type: 'string', minLength: 5 },
        unsubscribeUrl: { type: ['string','null'] },
        unsubscribeMailto: { type: ['string','null'] }
      }
    };

    const raw = await structuredComplete(messages, {
      temperature: 0.2,
      maxTokens: 400,
      schema,
      model: 'gpt-4o-mini'
    });

    console.log('AI analyzeEmail raw response:', raw);
    let parsed = safeParseJSON(raw);
    if (!parsed) {
      // Attempt second try with legacy complete as deep fallback
      const legacyRaw = await complete(messages, { temperature: 0.2, maxTokens: 300, response_format: { type: 'json_object' } });
      parsed = safeParseJSON(legacyRaw);
    }

    if (parsed && typeof parsed.summary === 'string') {
      return {
        summary: parsed.summary,
        unsubscribeUrl: parsed.unsubscribeUrl || null,
        unsubscribeMailto: parsed.unsubscribeMailto || null,
      };
    }
  } catch (error) {
    console.error('Email analysis error:', error.message);
  }

  return {
    summary: email.snippet?.substring(0, 100) || 'No summary available',
    unsubscribeUrl: null,
    unsubscribeMailto: null,
  };
}
