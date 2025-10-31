import express from 'express';
import { PrismaClient } from '@email-sorter/db';
import { parseCursor, createCursor, isArray } from '@email-sorter/core';
import { createOAuth2Client, trashMessage, createRawMessage, sendMessage } from '@email-sorter/gmail';
import { decryptToken } from '@email-sorter/core';

const router = express.Router();
const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// List emails with pagination
router.get('/', requireAuth, async (req, res) => {
  try {
    const { categoryId, cursor } = req.query;
    const limit = 50;

    const where = {
      userId: req.session.userId,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const cursorData = parseCursor(cursor);
    const options = {
      where,
      take: limit + 1,
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        snippet: true,
        aiSummary: true,
        unsubscribeUrl: true,
        unsubscribeMailto: true,
        categoryId: true,
      },
    };

    if (cursorData?.id) {
      options.cursor = { id: cursorData.id };
      options.skip = 1;
    }

    const emails = await prisma.email.findMany(options);

    const hasMore = emails.length > limit;
    const items = hasMore ? emails.slice(0, limit) : emails;

    const nextCursor = hasMore ? createCursor({ id: items[items.length - 1].id }) : null;

    res.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get single email
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const email = await prisma.email.findFirst({
      where: {
        id,
        userId: req.session.userId,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// Bulk delete emails
router.post('/bulk/delete', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    // Get emails with account info
    const emails = await prisma.email.findMany({
      where: {
        id: { in: ids },
        userId: req.session.userId,
      },
      include: {
        account: true,
      },
    });

    // Group by account and trash on Gmail
    const accountGroups = {};
    for (const email of emails) {
      if (!accountGroups[email.accountId]) {
        accountGroups[email.accountId] = {
          account: email.account,
          gmailIds: [],
        };
      }
      accountGroups[email.accountId].gmailIds.push(email.gmailId);
    }

    // Trash on Gmail
    for (const accountId in accountGroups) {
      const { account, gmailIds } = accountGroups[accountId];
      
      try {
        const accessToken = await decryptToken(account.accessTokenEnc, ENCRYPTION_KEY);
        const oauth2Client = createOAuth2Client(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_OAUTH_REDIRECT_URI
        );
        oauth2Client.setCredentials({ access_token: accessToken });

        for (const gmailId of gmailIds) {
          await trashMessage(oauth2Client, gmailId);
        }
      } catch (error) {
        console.error(`Error trashing emails for account ${accountId}:`, error);
      }
    }

    // Delete from database
    await prisma.email.deleteMany({
      where: {
        id: { in: ids },
        userId: req.session.userId,
      },
    });

    res.json({ success: true, count: emails.length });
  } catch (error) {
    console.error('Error deleting emails:', error);
    res.status(500).json({ error: 'Failed to delete emails' });
  }
});

// Bulk unsubscribe
router.post('/bulk/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    // Get emails
    const emails = await prisma.email.findMany({
      where: {
        id: { in: ids },
        userId: req.session.userId,
      },
    });

    // Count emails with unsubscribe options
    let queued = 0;
    for (const email of emails) {
      if (email.unsubscribeUrl || email.unsubscribeMailto) {
        queued++;
        // In production, enqueue to BullMQ:
        // await enqueueUnsubscribeJob(email.id);
      }
    }

    res.json({ success: true, queued });
  } catch (error) {
    console.error('Error queueing unsubscribe:', error);
    res.status(500).json({ error: 'Failed to queue unsubscribe' });
  }
});

export default router;
