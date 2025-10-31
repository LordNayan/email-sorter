import { complete } from './client.js';

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
    const response = await complete(messages, { temperature: 0.2, maxTokens: 100 });
    
    // Parse JSON response
    const parsed = JSON.parse(response.trim());
    
    // Validate response structure
    if (parsed.categoryName && typeof parsed.confidence === 'number') {
      // Verify category exists
      const categoryExists = categories.some(cat => cat.name === parsed.categoryName);
      if (categoryExists) {
        return parsed;
      }
    }
    
    // Fallback to first category
    return { categoryName: categories[0].name, confidence: 0.5 };
  } catch (error) {
    console.error('Classification error:', error.message);
    // Fallback to first category
    return { categoryName: categories[0].name, confidence: 0.3 };
  }
}

/**
 * Summarize email content to 1-3 sentences
 * @param {object} email - { subject, from, text }
 * @returns {Promise<string>}
 */
export async function summarizeEmail(email) {
  const emailContent = `
Subject: ${email.subject || 'No subject'}
From: ${email.from || 'Unknown'}
Content: ${(email.text || email.html || email.snippet || '').substring(0, 2000)}
  `.trim();

  const messages = [
    {
      role: 'system',
      content: 'You are an email summarization assistant. Summarize emails in 1-3 clear, concise sentences. Focus on the main purpose and any action items.',
    },
    {
      role: 'user',
      content: `Summarize this email:\n\n${emailContent}`,
    },
  ];

  try {
    const response = await complete(messages, { temperature: 0.3, maxTokens: 150 });
    return response.trim() || email.snippet?.substring(0, 100) || 'No summary available';
  } catch (error) {
    console.error('Summarization error:', error.message);
    return email.snippet?.substring(0, 100) || 'No summary available';
  }
}

/**
 * Analyze email and extract unsubscribe information using AI
 * @param {object} email - { subject, from, text, html }
 * @returns {Promise<{ summary: string, unsubscribeUrl: string|null, unsubscribeMailto: string|null }>}
 */
export async function analyzeEmail(email) {
  // Use HTML if available (contains links), otherwise text
  const content = (email.html || email.text || email.snippet || '').substring(0, 8000);
  
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
2. Any unsubscribe URL (http/https links)
3. Any unsubscribe mailto address

Look for unsubscribe information in:
- Links with text like "unsubscribe", "opt out", "manage preferences", "stop receiving"
- Footer links
- mailto: links for unsubscribe

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief 1-3 sentence summary",
  "unsubscribeUrl": "https://example.com/unsubscribe" or null,
  "unsubscribeMailto": "unsubscribe@example.com" or null
}`,
    },
    {
      role: 'user',
      content: `Analyze this email:\n\n${emailContent}`,
    },
  ];

  try {
    const response = await complete(messages, { temperature: 0.2, maxTokens: 300 });
    const parsed = JSON.parse(response.trim());
    
    // Validate response structure
    if (parsed.summary && typeof parsed.summary === 'string') {
      return {
        summary: parsed.summary,
        unsubscribeUrl: parsed.unsubscribeUrl || null,
        unsubscribeMailto: parsed.unsubscribeMailto || null,
      };
    }
    
    // Fallback
    return {
      summary: email.snippet?.substring(0, 100) || 'No summary available',
      unsubscribeUrl: null,
      unsubscribeMailto: null,
    };
  } catch (error) {
    console.error('Email analysis error:', error.message);
    return {
      summary: email.snippet?.substring(0, 100) || 'No summary available',
      unsubscribeUrl: null,
      unsubscribeMailto: null,
    };
  }
}
