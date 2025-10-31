import express from 'express';
import { PrismaClient } from '@email-sorter/db';

const router = express.Router();
const prisma = new PrismaClient();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// List connected accounts
router.get('/', requireAuth, async (req, res) => {
  try {
    const accounts = await prisma.connectedAccount.findMany({
      where: { userId: req.session.userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        historyId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Trigger resync for account
router.post('/:id/resync', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const account = await prisma.connectedAccount.findFirst({
      where: {
        id,
        userId: req.session.userId,
      },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // In production, enqueue sync job to BullMQ:
    // await enqueueSyncJob(account.id, { fullSync: true });
    
    res.json({ success: true, message: 'Sync queued' });
  } catch (error) {
    console.error('Error triggering resync:', error);
    res.status(500).json({ error: 'Failed to trigger resync' });
  }
});

export default router;
