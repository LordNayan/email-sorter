import { simpleParser } from 'mailparser';

/**
 * Parse Gmail message payload to extract headers and body
 */
export async function parseMessage(message) {
  const headers = {};
  
  // Extract headers
  if (message.payload?.headers) {
    for (const header of message.payload.headers) {
      headers[header.name.toLowerCase()] = header.value;
    }
  }

  // Extract body parts
  const parts = {
    text: '',
    html: '',
  };

  extractParts(message.payload, parts);

  // Decode body
  if (parts.text) {
    parts.text = decodeBody(parts.text);
  }
  if (parts.html) {
    parts.html = decodeBody(parts.html);
  }

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet,
    subject: headers.subject || '',
    from: headers.from || '',
    to: headers.to || '',
    date: headers.date || '',
    listUnsubscribe: headers['list-unsubscribe'] || null,
    text: parts.text,
    html: parts.html,
    headers,
  };
}

/**
 * Recursively extract text and HTML parts from message payload
 */
function extractParts(payload, parts) {
  if (!payload) return;

  // If this part has a body
  if (payload.body?.data) {
    const mimeType = payload.mimeType;
    
    if (mimeType === 'text/plain' && !parts.text) {
      parts.text = payload.body.data;
    } else if (mimeType === 'text/html' && !parts.html) {
      parts.html = payload.body.data;
    }
  }

  // Recursively process parts
  if (payload.parts) {
    for (const part of payload.parts) {
      extractParts(part, parts);
    }
  }
}

/**
 * Decode base64url encoded body
 */
function decodeBody(data) {
  try {
    return Buffer.from(data, 'base64url').toString('utf-8');
  } catch (error) {
    return '';
  }
}

/**
 * Extract unsubscribe information from headers and HTML
 */
export function extractUnsubscribeInfo(parsedMessage) {
  const info = {
    url: null,
    mailto: null,
  };

  // Parse List-Unsubscribe header
  if (parsedMessage.listUnsubscribe) {
    const unsubscribe = parsedMessage.listUnsubscribe;
    
    // Extract mailto
    const mailtoMatch = unsubscribe.match(/<mailto:([^>]+)>/);
    if (mailtoMatch) {
      info.mailto = mailtoMatch[1];
    }
    
    // Extract URL
    const urlMatch = unsubscribe.match(/<(https?:\/\/[^>]+)>/);
    if (urlMatch) {
      info.url = urlMatch[1];
    }
  }

  // If no URL from header, try to find in HTML
  if (!info.url && parsedMessage.html) {
    const unsubLink = findUnsubscribeLinkInHtml(parsedMessage.html);
    if (unsubLink) {
      info.url = unsubLink;
    }
  }

  return info;
}

/**
 * Find unsubscribe link in HTML content
 */
export function findUnsubscribeLinkInHtml(html) {
  if (!html) return null;

  // More comprehensive patterns to find unsubscribe links
  const patterns = [
    // Link with "unsubscribe" in the text
    /<a[^>]+href=["']([^"']+)["'][^>]*>.*?unsubscribe.*?<\/a>/gi,
    
    // Link with "unsubscribe" in the href
    /<a[^>]+href=["']([^"']+unsubscribe[^"']*)["']/gi,
    
    // "unsubscribe here" pattern - captures the "here" link
    /unsubscribe\s+<a[^>]+href=["']([^"']+)["'][^>]*>.*?here.*?<\/a>/gi,
    
    // "Update preferences or unsubscribe" with link on "here"
    /(?:update|manage).*?preferences.*?(?:or|and).*?unsubscribe\s+<a[^>]+href=["']([^"']+)["'][^>]*>/gi,
    
    // Link with "opt out", "opt-out", "remove"
    /<a[^>]+href=["']([^"']+)["'][^>]*>.*?(?:opt[- ]?out|remove|stop receiving).*?<\/a>/gi,
    
    // Reverse: text mentions unsubscribe before link
    /(?:unsubscribe|opt[- ]?out|remove).*?<a[^>]+href=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    const match = pattern.exec(html);
    if (match && match[1]) {
      // Decode HTML entities in URL
      let url = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
      
      // Only return if it looks like a valid URL
      if (url.startsWith('http') || url.startsWith('//')) {
        return url.startsWith('//') ? 'https:' + url : url;
      }
    }
  }

  return null;
}

/**
 * Truncate text for AI processing
 */
export function truncateForAI(text, maxLength = 2000) {
  if (!text) return '';
  return text.substring(0, maxLength);
}
