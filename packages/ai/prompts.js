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
    
    // Remove markdown code blocks if present
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse JSON response
    const parsed = JSON.parse(cleanResponse.trim());
    
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
    const response = await complete(messages, { temperature: 0.2, maxTokens: 300 });
    
    // Remove markdown code blocks if present
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const parsed = JSON.parse(cleanResponse.trim());
    
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
