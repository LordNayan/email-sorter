import { createGmailClient } from './oauth.js';

/**
 * List message IDs with optional query
 */
export async function listMessages(oauth2Client, options = {}) {
  const gmail = createGmailClient(oauth2Client);
  const { maxResults = 100, pageToken, q } = options;

  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    pageToken,
    q,
  });

  return {
    messages: res.data.messages || [],
    nextPageToken: res.data.nextPageToken,
  };
}

/**
 * Get full message by ID
 */
export async function getMessage(oauth2Client, messageId) {
  const gmail = createGmailClient(oauth2Client);
  
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return res.data;
}

/**
 * Get Gmail history
 */
export async function listHistory(oauth2Client, startHistoryId) {
  const gmail = createGmailClient(oauth2Client);
  
  try {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
    });

    return {
      history: res.data.history || [],
      historyId: res.data.historyId,
    };
  } catch (error) {
    if (error.code === 404) {
      // History ID is too old, need full sync
      return { history: [], historyId: null, needsFullSync: true };
    }
    throw error;
  }
}

/**
 * Modify message labels
 */
export async function modifyLabels(oauth2Client, messageId, addLabelIds = [], removeLabelIds = []) {
  const gmail = createGmailClient(oauth2Client);
  
  const res = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
  });

  return res.data;
}

/**
 * Archive a message (remove INBOX label)
 */
export async function archiveMessage(oauth2Client, messageId) {
  return modifyLabels(oauth2Client, messageId, [], ['INBOX']);
}

/**
 * Trash a message
 */
export async function trashMessage(oauth2Client, messageId) {
  const gmail = createGmailClient(oauth2Client);
  
  const res = await gmail.users.messages.trash({
    userId: 'me',
    id: messageId,
  });

  return res.data;
}

/**
 * Send an email
 */
export async function sendMessage(oauth2Client, rawMessage) {
  const gmail = createGmailClient(oauth2Client);
  
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
    },
  });

  return res.data;
}

/**
 * Create a raw email message for sending
 */
export function createRawMessage(to, subject, body) {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    '',
    body,
  ].join('\n');

  const encodedMessage = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return encodedMessage;
}
