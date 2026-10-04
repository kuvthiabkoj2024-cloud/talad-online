import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

export interface CategoryNode {
  id: string;
  slug: string;
  name: unknown;
  iconUrl: string | null;
  imageUrl: string | null;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active categories as a tree, ordered for display (landing-page category grid). */
  async findTree(): Promise<CategoryNode[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      select: {
        id: true,
        parentId: true,
        slug: true,
        name: true,
        iconUrl: true,
        imageUrl: true,
      },
    });

    const nodes = new Map<string, CategoryNode>();
    for (const { parentId: _, ...row } of rows) {
      nodes.set(row.id, { ...row, children: [] });
    }

    const roots: CategoryNode[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id)!;
      const parent = row.parentId ? nodes.get(row.parentId) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }
}
