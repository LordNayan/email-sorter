import express from 'express';
import { PrismaClient } from '@email-sorter/db';
import { parseCursor, createCursor, isArray } from '@email-sorter/core';
import { Queue } from 'bullmq';

// Factory allows injecting a mock Prisma & Queue for tests
export function createEmailsRouter({ prisma = new PrismaClient(), queue } = {}) {
  const router = express.Router();
  const unsubscribeQueue = queue || new Queue('unsubscribe', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  });

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

      const where = { userId: req.session.userId };
      if (categoryId) where.categoryId = categoryId;

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
      res.json({ items, nextCursor, hasMore });
    } catch (error) {
      console.error('Error fetching emails:', error);
      res.status(500).json({ error: 'Failed to fetch emails' });
    }
  });

  // Get single email
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const email = await prisma.email.findFirst({ where: { id, userId: req.session.userId } });
      if (!email) return res.status(404).json({ error: 'Email not found' });
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
      const { count } = await prisma.email.deleteMany({
        where: { id: { in: ids }, userId: req.session.userId },
      });
      res.json({ success: true, count });
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
      const emails = await prisma.email.findMany({
        where: { id: { in: ids }, userId: req.session.userId },
      });
      let queued = 0;
      for (const email of emails) {
        if (email.unsubscribeUrl || email.unsubscribeMailto) {
          await unsubscribeQueue.add('unsubscribe-email', { emailId: email.id });
          queued++;
        }
      }
      res.json({ success: true, queued });
    } catch (error) {
      console.error('Error queueing unsubscribe:', error);
      res.status(500).json({ error: 'Failed to queue unsubscribe' });
    }
  });

  return router;
}

// Backwards-compatible default export (used by main index.js)
const defaultRouter = createEmailsRouter();
export default defaultRouter;
