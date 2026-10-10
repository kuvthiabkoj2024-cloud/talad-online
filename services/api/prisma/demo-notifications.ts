/**
 * Demo notification inbox for development: one notification per status change of the
 * customer's demo orders, plus promotions, a price drop and platform updates, in Lao
 * and English. Run after seedDemoOrders.
 */
import type { NotificationData, NotificationType } from '@talad/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { orderMessage } from '../src/modules/notifications/order-messages.js';

const HOUR = 3_600_000;
/** The newest few start out unread, like a customer who checks the app now and then. */
const UNREAD = 8;

type Text = { title: string; body: string };

interface Extra {
  type: NotificationType;
  ageHours: number;
  lo: Text;
  en: Text;
  link?: string;
  /** Demo product whose first photo is the thumbnail. */
  product?: string;
}

const EXTRAS: Extra[] = [
  {
    type: 'PROMOTION',
    ageHours: 1,
    lo: { title: 'Flash sale ເລີ່ມແລ້ວ ⚡', body: 'ຫຼຸດສູງສຸດ 30% ສຳລັບກາເຟ, ຜ້າໄໝ ແລະ ອື່ນໆ — ມື້ນີ້ເທົ່ານັ້ນ.' },
    en: { title: 'Flash sale is live ⚡', body: 'Up to 30% off coffee, silk and more — today only.' },
    link: '/',
    product: 'bolaven-arabica-500g',
  },
  {
    type: 'PRICE_DROP',
    ageHours: 6,
    lo: { title: 'ລາຄາຫຼຸດ: ສິ້ນໄໝລາວທໍມື', body: 'ດຽວນີ້ ₭450,000 (ຈາກ ₭520,000). ຮີບຊື້ກ່ອນສິນຄ້າໝົດ.' },
    en: { title: 'Price drop: Handwoven Lao silk sinh', body: "Now ₭450,000 (was ₭520,000). Grab it before it's gone." },
    link: '/p/talad-demo/handwoven-silk-sinh',
    product: 'handwoven-silk-sinh',
  },
  {
    type: 'SYSTEM',
    ageHours: 26,
    lo: { title: 'ໃໝ່: ເບິ່ງວິດີໂອສິນຄ້າໃນຟີດ', body: 'ປັດເບິ່ງວິດີໂອສັ້ນຈາກຮ້ານຄ້າ ແລະ ສັ່ງຊື້ໄດ້ທັນທີ.' },
    en: { title: 'New: product videos in Feed', body: 'Swipe through short videos from shops and buy straight from them.' },
    link: '/feed',
  },
  {
    type: 'PROMOTION',
    ageHours: 3 * 24,
    lo: { title: 'ທ້າຍອາທິດສົ່ງຟຣີ', body: 'ສົ່ງຟຣີຈາກຮ້ານທີ່ຮ່ວມລາຍການ ວັນເສົາ ແລະ ວັນອາທິດນີ້.' },
    en: { title: 'Free delivery weekend', body: 'Free delivery from participating shops this Saturday and Sunday.' },
    link: '/',
  },
  {
    type: 'PROMOTION',
    ageHours: 9 * 24,
    lo: { title: 'ຂອງຂວັນສຳລັບທ່ານ: ຫຼຸດ 10%', body: 'ໃຊ້ລະຫັດ TALAD10 ເມື່ອສັ່ງຊື້ຕັ້ງແຕ່ ₭100,000 ຫຼຸດສູງສຸດ ₭30,000.' },
    en: { title: 'A gift for you: 10% off', body: 'Use code TALAD10 on orders from ₭100,000 — up to ₭30,000 off.' },
    link: '/',
  },
  {
    type: 'SYSTEM',
    ageHours: 21 * 24,
    lo: { title: 'ຍິນດີຕ້ອນຮັບສູ່ Taladonline!', body: 'ບັນຊີຂອງທ່ານພ້ອມແລ້ວ. ເພີ່ມທີ່ຢູ່ຈັດສົ່ງເພື່ອສັ່ງຊື້ໄດ້ໄວຂຶ້ນ.' },
    en: { title: 'Welcome to Taladonline!', body: 'Your account is ready. Add a delivery address to check out faster.' },
    link: '/account/addresses',
  },
];

/** Adds the demo inbox to a customer that has no notifications yet. Returns how many were created. */
export async function seedDemoNotifications(prisma: PrismaClient, customerId: string): Promise<number> {
  if (await prisma.notification.count({ where: { customerId } })) return 0;

  const firstImage = { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } as const;
  const orders = await prisma.shopOrder.findMany({
    where: { order: { customerId } },
    select: {
      number: true,
      shop: { select: { name: true } },
      history: { select: { toStatus: true, createdAt: true } },
      items: { take: 1, select: { product: { select: { images: firstImage } } } },
    },
  });
  const products = await prisma.product.findMany({
    where: { slug: { in: EXTRAS.flatMap((e) => (e.product ? [e.product] : [])) } },
    select: { slug: true, images: firstImage },
  });
  const imageOf = new Map(products.map((p) => [p.slug, p.images[0]?.key]));

  const now = Date.now();
  const row = (type: NotificationType, createdAt: Date, lo: Text, en: Text, data: NotificationData) => ({
    customerId,
    type,
    title: en.title,
    body: en.body,
    data: { ...data, i18n: { lo, en } } as object,
    createdAt,
    readAt: null as Date | null,
  });

  const rows = [
    ...orders.flatMap((o) =>
      o.history.map((h) => {
        const text = orderMessage(h.toStatus, o.number, o.shop.name);
        return row('ORDER', h.createdAt, text.lo, text.en, {
          link: `/account/orders/${o.number}`,
          imageUrl: o.items[0]?.product.images[0]?.key,
        });
      }),
    ),
    ...EXTRAS.map((e) =>
      row(e.type, new Date(now - e.ageHours * HOUR), e.lo, e.en, {
        link: e.link,
        imageUrl: e.product ? imageOf.get(e.product) : undefined,
      }),
    ),
  ];
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  rows.slice(UNREAD).forEach((r) => (r.readAt = new Date(r.createdAt.getTime() + HOUR)));
  await prisma.notification.createMany({ data: rows });
  return rows.length;
}
