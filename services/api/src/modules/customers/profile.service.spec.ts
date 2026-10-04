import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../media/storage.service.js';
import { ProfileService } from './profile.service.js';

const customer = {
  id: 'c1',
  name: 'Somchai',
  phone: '+8562099990000',
  email: 'somchai@example.com',
  avatarUrl: null,
  googleId: null,
  appleId: null,
  createdAt: new Date(),
  shop: null,
};

function service(update: ReturnType<typeof vi.fn>) {
  const prisma = { customer: { update } } as unknown as PrismaService;
  return new ProfileService(prisma, {} as StorageService);
}

describe('ProfileService.update', () => {
  it('trims the name and lower-cases the email', async () => {
    const update = vi.fn().mockResolvedValue(customer);
    await service(update).update('c1', { name: '  Somchai ', email: ' Somchai@Example.com ' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: { name: 'Somchai', email: 'somchai@example.com' },
      }),
    );
  });

  it('clears the email when it is empty', async () => {
    const update = vi.fn().mockResolvedValue({ ...customer, email: null });
    await service(update).update('c1', { name: 'Somchai', email: '' });
    expect(update.mock.calls[0][0].data.email).toBeNull();
  });

  it('reports EMAIL_TAKEN when another account has the email', async () => {
    const update = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const error = await service(update)
      .update('c1', { name: 'Somchai', email: 'taken@example.com' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});
