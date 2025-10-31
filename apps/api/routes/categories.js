import express from 'express';
import { PrismaClient } from '@email-sorter/db';
import { validateRequired, sanitizeCategoryName } from '@email-sorter/core';

const router = express.Router();
const prisma = new PrismaClient();

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// List categories
router.get('/', requireAuth, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.session.userId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { emails: true },
        },
      },
    });

    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;

    validateRequired(req.body, ['name']);
    const sanitizedName = sanitizeCategoryName(name);

    const category = await prisma.category.create({
      data: {
        userId: req.session.userId,
        name: sanitizedName,
        description: description || null,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Error creating category:', error);
    res.status(400).json({ error: error.message || 'Failed to create category' });
  }
});

// Update category
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const updateData = {};
    if (name !== undefined) {
      updateData.name = sanitizeCategoryName(name);
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    const category = await prisma.category.updateMany({
      where: {
        id,
        userId: req.session.userId,
      },
      data: updateData,
    });

    if (category.count === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const updated = await prisma.category.findUnique({
      where: { id },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Error updating category:', error);
    res.status(400).json({ error: error.message || 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.category.deleteMany({
      where: {
        id,
        userId: req.session.userId,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
