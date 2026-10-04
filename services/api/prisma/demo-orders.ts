/**
 * Demo order history for development: one order in every status, built from the
 * demo catalog, with payments, status history, tracking and deadlines.
 */
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '../src/generated/prisma/client.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HAPPY_PATH: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
const COMMISSION_RATE = 0.05;

interface Scenario {
  status: OrderStatus;
  ageHours: number;
  method: PaymentMethod;
  /** [product slug, variant sku suffix | null, quantity] */
  items: [string, string | null, number][];
  discount?: number;
  cancelReason?: string;
  note?: string;
}

const SCENARIOS: Scenario[] = [
  { status: 'PENDING', ageHours: 2, method: 'BCEL_ONE', items: [['bolaven-arabica-500g', '500G', 1], ['jeow-bong-chili-paste', null, 2]] },
  { status: 'CONFIRMED', ageHours: 20, method: 'LAPNET', items: [['coconut-oil-450ml', null, 1]] },
  { status: 'PACKED', ageHours: 40, method: 'U_MONEY', items: [['cotton-tshirt-basic', 'M', 2], ['yoga-mat-6mm', null, 1]] },
  { status: 'SHIPPED', ageHours: 3 * 24, method: 'BCEL_ONE', items: [['wireless-earbuds', null, 1], ['power-bank-20000', null, 1]] },
  { status: 'DELIVERED', ageHours: 5 * 24, method: 'COD', items: [['sticky-rice-5kg', '1BAG', 2], ['bamboo-rice-basket', null, 1]] },
  { status: 'COMPLETED', ageHours: 12 * 24, method: 'BCEL_ONE', items: [['handwoven-silk-sinh', null, 1]], discount: 20_000 },
  { status: 'COMPLETED', ageHours: 20 * 24, method: 'BANK_TRANSFER', items: [['cat-food-1kg', null, 3], ['baby-wipes-80', null, 2]] },
  {
    status: 'CANCELLED',
    ageHours: 8 * 24,
    method: 'LAPNET',
    items: [['power-bank-20000', null, 1]],
    cancelReason: 'Payment was not completed before the deadline',
  },
  {
    status: 'RETURN_REQUESTED',
    ageHours: 10 * 24,
    method: 'U_MONEY',
    items: [['wireless-earbuds', null, 1]],
    note: 'Right earbud does not charge',
  },
];

function statusPath(target: OrderStatus): OrderStatus[] {
  if (target === 'CANCELLED') return ['PENDING', 'CANCELLED'];
  if (target === 'RETURN_REQUESTED') return [...HAPPY_PATH.slice(0, 5), 'RETURN_REQUESTED'];
  return HAPPY_PATH.slice(0, HAPPY_PATH.indexOf(target) + 1);
}

const yymmdd = (d: Date) => d.toISOString().slice(2, 10).replaceAll('-', '');

/** Adds the demo orders to a customer that has none yet. Returns how many were created. */
export async function seedDemoOrders(prisma: PrismaClient, customerId: string): Promise<number> {
  if (await prisma.order.count({ where: { customerId } })) return 0;

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const shop = await prisma.shop.findUniqueOrThrow({ where: { slug: 'talad-demo' } });
  const delivery = await prisma.deliveryProvider.findUnique({ where: { code: 'manual' } });
  const products = await prisma.product.findMany({
    where: { shopId: shop.id },
    include: { variants: true },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const address = {
    recipientName: customer.name,
    phone: customer.phone ?? '+8562099990000',
    province: 'VT',
    district: 'Chanthabouly',
    village: 'Ban Haisok',
    line: 'House 12, Unit 5, Samsenthai Road',
  };
  if (!(await prisma.address.count({ where: { customerId } }))) {
    await prisma.address.create({
      data: { customerId, label: 'HOME', isDefault: true, ...address },
    });
  }

  let seq = await prisma.shopOrder.count();
  for (const s of SCENARIOS) {
    const createdAt = new Date(Date.now() - s.ageHours * HOUR);
    const path = statusPath(s.status);
    // Spread the status changes over the order's age.
    const step = Math.min(10 * HOUR, (s.ageHours * HOUR) / (path.length + 1));
    const at = (i: number) => new Date(createdAt.getTime() + i * step);

    const lines = s.items.map(([slug, suffix, quantity]) => {
      const product = bySlug.get(slug);
      if (!product) throw new Error(`Demo product ${slug} missing — run the catalog seed first`);
      const variant = suffix ? product.variants.find((v) => v.sku.endsWith(`-${suffix}`)) : undefined;
      const unitPrice = (variant?.price ?? product.price).toNumber();
      return {
        productId: product.id,
        variantId: variant?.id,
        name: product.name,
        sku: variant?.sku ?? product.sku,
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
      };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const discount = s.discount ?? 0;
    // Delivery is paid to the courier, not through Taladonline.
    const total = subtotal - discount;
    const reached = (status: OrderStatus) => path.includes(status);
    const paid = s.status !== 'PENDING' && s.status !== 'CANCELLED' && (s.method !== 'COD' || reached('DELIVERED'));
    const paymentStatus: PaymentStatus =
      s.status === 'CANCELLED' ? 'EXPIRED' : paid ? 'PAID' : 'PENDING';
    const deliveredAt = reached('DELIVERED') ? at(path.indexOf('DELIVERED')) : null;
    seq += 1;
    const number = `TL${yymmdd(createdAt)}${String(seq).padStart(5, '0')}`;

    await prisma.order.create({
      data: {
        number: `O${number}`,
        customerId,
        shippingAddress: address,
        subtotal,
        discountTotal: discount,
        grandTotal: total,
        createdAt,
        payments: {
          create: {
            method: s.method,
            status: paymentStatus,
            amount: total,
            paidAt: paid ? (s.method === 'COD' ? deliveredAt : at(0.2)) : null,
            providerRef: paid && s.method !== 'COD' ? `${s.method}-${seq}${Date.now() % 100000}` : null,
            createdAt,
          },
        },
        shopOrders: {
          create: {
            number,
            shopId: shop.id,
            status: s.status,
            subtotal,
            discountTotal: discount,
            commissionAmount: Math.round(subtotal * COMMISSION_RATE),
            total,
            deliveryProviderId: reached('SHIPPED') ? delivery?.id : undefined,
            trackingNumber: reached('SHIPPED') ? `TLX${String(seq).padStart(8, '0')}` : null,
            paymentDueAt: new Date(createdAt.getTime() + DAY),
            autoConfirmAt: deliveredAt && s.status === 'DELIVERED' ? new Date(deliveredAt.getTime() + 7 * DAY) : null,
            cancelReason: s.cancelReason,
            createdAt,
            items: { create: lines },
            history: {
              create: path.map((status, i) => ({
                fromStatus: i === 0 ? null : path[i - 1],
                toStatus: status,
                actorType: status === 'RETURN_REQUESTED' || status === 'PENDING' ? 'CUSTOMER' : 'SHOP',
                note: status === 'RETURN_REQUESTED' ? s.note : status === 'CANCELLED' ? s.cancelReason : null,
                createdAt: at(i),
              })),
            },
          },
        },
      },
    });
  }
  return SCENARIOS.length;
}
