import { google } from 'googleapis';

/**
 * Create OAuth2 client
 */
export function createOAuth2Client(clientId, clientSecret, redirectUri) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate auth URL for user consent
 */
export function getAuthUrl(oauth2Client) {
  const scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(oauth2Client, code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Set credentials on OAuth2 client
 */
export function setCredentials(oauth2Client, tokens) {
  oauth2Client.setCredentials(tokens);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(oauth2Client, refreshToken) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

/**
 * Get user info from Google
 */
export async function getUserInfo(oauth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

/**
 * Create Gmail API client
 */
export function createGmailClient(oauth2Client) {
  return google.gmail({ version: 'v1', auth: oauth2Client });
}
