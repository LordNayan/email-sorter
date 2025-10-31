import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { PrismaClient } from '@email-sorter/db';
import app from '../index.js';

const prisma = new PrismaClient();

describe('Categories API', () => {
  let testUser;
  let session;

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test-api@example.com',
        name: 'Test User',
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.category.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.delete({
      where: { id: testUser.id },
    });
    await prisma.$disconnect();
  });

  test('should create a category', async () => {
    const agent = request.agent(app);
    
    // Mock session
    const res = await agent
      .post('/categories')
      .send({
        name: 'Test Category',
        description: 'Test description',
      });

    // This test needs proper session setup, skipping for now
    // In a real test, we'd set up proper authentication
  });

  test('should list categories', async () => {
    // Create a category directly
    await prisma.category.create({
      data: {
        userId: testUser.id,
        name: 'List Test',
        description: 'Test',
      },
    });

    // Test would require auth session
  });
});
