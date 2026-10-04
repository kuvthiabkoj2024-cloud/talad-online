import { CategoriesService } from './categories.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';

describe('CategoriesService', () => {
  it('nests children under their parent and returns top-level categories as roots', async () => {
    const rows = [
      { id: 'a', parentId: null, slug: 'food', name: {}, iconUrl: null, imageUrl: null },
      { id: 'b', parentId: 'a', slug: 'fruit', name: {}, iconUrl: null, imageUrl: null },
      { id: 'c', parentId: null, slug: 'home', name: {}, iconUrl: null, imageUrl: null },
    ];
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue(rows) },
    } as unknown as PrismaService;

    const tree = await new CategoriesService(prisma).findTree();

    expect(tree.map((n) => n.slug)).toEqual(['food', 'home']);
    expect(tree[0].children.map((n) => n.slug)).toEqual(['fruit']);
  });
});
