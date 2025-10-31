import express from 'express';
import { PrismaClient } from '@email-sorter/db';
import { createOAuth2Client, getAuthUrl, getTokensFromCode, getUserInfo } from '@email-sorter/gmail';
import { encryptToken } from '@email-sorter/core';

const router = express.Router();
const prisma = new PrismaClient();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI;
const ALLOWED_EMAILS = (process.env.GOOGLE_TEST_ALLOWED_EMAILS || '').split(',').map(e => e.trim());
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Start OAuth flow
router.get('/google', (req, res) => {
  const oauth2Client = createOAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  const authUrl = getAuthUrl(oauth2Client);
  res.redirect(authUrl);
});

// OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${process.env.WEB_URL}/login?error=no_code`);
  }

  try {
    const oauth2Client = createOAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    // Exchange code for tokens
    const tokens = await getTokensFromCode(oauth2Client, code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const userInfo = await getUserInfo(oauth2Client);
    
    // Check if email is allowed
    if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(userInfo.email)) {
      console.log('Email not allowed, redirecting...');
      return res.redirect(`${process.env.WEB_URL}/login?error=not_allowed`);
    }

    // Create or update user
    let user = await prisma.user.findUnique({
      where: { email: userInfo.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name,
        },
      });
    }

    // Encrypt tokens
    const accessTokenEnc = await encryptToken(tokens.access_token, ENCRYPTION_KEY);
    const refreshTokenEnc = await encryptToken(tokens.refresh_token, ENCRYPTION_KEY);

    // Create or update connected account
    await prisma.connectedAccount.upsert({
      where: { googleUserId: userInfo.id },
      update: {
        accessTokenEnc,
        refreshTokenEnc,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        userId: user.id,
        email: userInfo.email,
        googleUserId: userInfo.id,
        accessTokenEnc,
        refreshTokenEnc,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    // Set session
    req.session.userId = user.id;

    // Redirect to dashboard
    res.redirect(`${process.env.WEB_URL}/dashboard`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.WEB_URL}/login?error=auth_failed`);
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

export default router;
