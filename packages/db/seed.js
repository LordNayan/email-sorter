import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a test user
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  console.log('Created user:', user.email);

  // Create default categories
  const categories = [
    {
      name: 'Newsletter',
      description: 'Marketing emails, newsletters, and promotional content',
    },
    {
      name: 'Social',
      description: 'Social media notifications and updates',
    },
  ];

  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name: cat.name,
        },
      },
      update: {},
      create: {
        userId: user.id,
        name: cat.name,
        description: cat.description,
      },
    });
    console.log('Created category:', category.name);
  }

  // Create a dummy email
  const account = await prisma.connectedAccount.findFirst({
    where: { userId: user.id },
  });

  if (account) {
    const newsletter = await prisma.category.findFirst({
      where: {
        userId: user.id,
        name: 'Newsletter',
      },
    });

    await prisma.email.upsert({
      where: { gmailId: 'dummy-gmail-id-123' },
      update: {},
      create: {
        userId: user.id,
        accountId: account.id,
        gmailId: 'dummy-gmail-id-123',
        threadId: 'thread-123',
        subject: 'Welcome to Our Newsletter!',
        from: 'newsletter@example.com',
        receivedAt: new Date(),
        snippet: 'Thank you for subscribing to our newsletter...',
        text: 'Thank you for subscribing to our newsletter. We will keep you updated.',
        aiSummary: 'Welcome email from a newsletter subscription.',
        categoryId: newsletter?.id,
        unsubscribeUrl: 'https://example.com/unsubscribe',
      },
    });
    console.log('Created dummy email');
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
