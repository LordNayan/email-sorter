import { Worker } from 'bullmq';
import { PrismaClient } from '@email-sorter/db';
import { createOAuth2Client, listMessages, getMessage, parseMessage, extractUnsubscribeInfo, archiveMessage, listHistory } from '@email-sorter/gmail';
import { classifyEmail, analyzeEmail } from '@email-sorter/ai';
import { decryptToken } from '@email-sorter/core';

export const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

/**
 * Process sync job
 */
export async function processSyncJob(job) {
  const { accountId, fullSync = false } = job.data;

  console.log(`Processing sync for account ${accountId}`);

  // Get account with user
  const account = await prisma.connectedAccount.findUnique({
    where: { id: accountId },
    include: {
      user: {
        include: {
          categories: true,
        },
      },
    },
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  // Decrypt tokens
  const accessToken = await decryptToken(account.accessTokenEnc, ENCRYPTION_KEY);
  const refreshToken = await decryptToken(account.refreshTokenEnc, ENCRYPTION_KEY);

  // Create OAuth client
  const oauth2Client = createOAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  let messageIds = [];

  // Use history API if available and not full sync
  if (account.historyId && !fullSync) {
    try {
      const { history, historyId, needsFullSync } = await listHistory(oauth2Client, account.historyId);
      
      if (needsFullSync) {
        console.log('History too old, doing full sync');
        return processSyncJob({ ...job, data: { ...job.data, fullSync: true } });
      }

      // Extract message IDs from history
      for (const record of history) {
        if (record.messagesAdded) {
          messageIds.push(...record.messagesAdded.map(m => m.message.id));
        }
      }

      // Update history ID
      if (historyId) {
        await prisma.connectedAccount.update({
          where: { id: accountId },
          data: { historyId },
        });
      }
    } catch (error) {
      console.error('History API error, falling back to list:', error);
      fullSync = true;
    }
  }

  // If full sync or no history, list recent messages
  if (fullSync || messageIds.length === 0) {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const { messages } = await listMessages(oauth2Client, {
      q: `after:${sevenDaysAgo}`,
      maxResults: 100,
    });
    messageIds = messages.map(m => m.id);
  }

  console.log(`Found ${messageIds.length} messages to process`);

  // Process each message
  for (const messageId of messageIds) {
    try {
      // Check if already processed
      const existing = await prisma.email.findUnique({
        where: { gmailId: messageId },
      });

      if (existing) {
        console.log(`Skipping already processed message ${messageId}`);
        continue;
      }

      // Fetch message
      const message = await getMessage(oauth2Client, messageId);
      const parsed = await parseMessage(message);

      // Classify email
      let categoryId = null;
      if (account.user.categories.length > 0) {
        const classification = await classifyEmail(
          {
            subject: parsed.subject,
            from: parsed.from,
            text: parsed.text,
            html: parsed.html,
            snippet: parsed.snippet,
          },
          account.user.categories
        );

        const category = account.user.categories.find(c => c.name === classification.categoryName);
        if (category) {
          categoryId = category.id;
        }
      }

      // Analyze email with AI (get summary + unsubscribe info)
      const analysis = await analyzeEmail({
        subject: parsed.subject,
        from: parsed.from,
        text: parsed.text,
        html: parsed.html,
        snippet: parsed.snippet,
      });

      // Fallback to regex extraction if AI didn't find unsubscribe info
      if (!analysis.unsubscribeUrl && !analysis.unsubscribeMailto) {
        const unsubInfo = extractUnsubscribeInfo(parsed);
        analysis.unsubscribeUrl = analysis.unsubscribeUrl || unsubInfo.url;
        analysis.unsubscribeMailto = analysis.unsubscribeMailto || unsubInfo.mailto;
      }

      // Parse date
      let receivedAt = new Date();
      if (parsed.date) {
        try {
          receivedAt = new Date(parsed.date);
        } catch (e) {
          console.error('Error parsing date:', e);
        }
      }

      // Archive on Gmail
      await archiveMessage(oauth2Client, messageId);

      // Save to database
      await prisma.email.create({
        data: {
          userId: account.userId,
          accountId: account.id,
          gmailId: messageId,
          threadId: parsed.threadId,
          subject: parsed.subject,
          from: parsed.from,
          receivedAt,
          snippet: parsed.snippet,
          html: parsed.html,
          text: parsed.text,
          aiSummary: analysis.summary,
          categoryId,
          archivedAt: new Date(),
          unsubscribeUrl: analysis.unsubscribeUrl,
          unsubscribeMailto: analysis.unsubscribeMailto,
        },
      });

      console.log(`Processed email: ${parsed.subject}`);
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
    }
  }

  console.log(`Sync completed for account ${accountId}`);
}

export const syncWorker = new Worker('email-sync', processSyncJob, {
  connection: redisConnection,
  concurrency: 2,
});

syncWorker.on('completed', (job) => {
  console.log(`Sync job ${job.id} completed`);
});

syncWorker.on('failed', (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err);
});
