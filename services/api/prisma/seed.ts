/**
 * Development seed: a super admin, reference data (units, categories,
 * delivery provider), CMS page stubs, platform settings and a demo catalog.
 * Idempotent — safe to run repeatedly.
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import QRCode from 'qrcode';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DEFAULT_ROLE_PERMISSIONS, normalizePhone } from '@talad/shared';
import { DEMO_PAGES } from './demo-content.js';
import { DEMO_PRODUCT_IMAGES } from './demo-images.js';
import { DEMO_PRODUCT_VIDEOS } from './demo-videos.js';
import { seedDemoNotifications } from './demo-notifications.js';
import { seedDemoOrders } from './demo-orders.js';
import { seedDemoShopExtras } from './demo-shop-extras.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const t = (lo: string, en: string) => ({ lo, en });

async function main() {
  // Built-in admin roles (§2.1), with their starting permissions; existing ones are left as edited.
  const roleIds: Record<string, string> = {};
  for (const [key, name, description] of [
    ['SUPER_ADMIN', 'Super Admin', 'Everything, including admins and roles.'],
    ['SUPPORT', 'Support', 'Shops, products, customers, orders and disputes.'],
    ['FINANCE', 'Finance', 'Payouts, reports, orders and shop commission.'],
  ] as const) {
    const role = await prisma.adminRole.upsert({
      where: { key },
      update: {},
      create: { key, name, description, isSuper: key === 'SUPER_ADMIN', permissions: key === 'SUPER_ADMIN' ? [] : DEFAULT_ROLE_PERMISSIONS[key] },
    });
    roleIds[key] = role.id;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@talad.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Super Admin',
      roleId: roleIds.SUPER_ADMIN,
      passwordHash: await argon2.hash(password),
    },
  });

  // Scoped staff for trying out roles (§2.1): same password as the super admin.
  for (const [role, staffEmail, name] of [
    ['SUPPORT', 'support@talad.local', 'Support Staff'],
    ['FINANCE', 'finance@talad.local', 'Finance Staff'],
  ] as const) {
    await prisma.adminUser.upsert({
      where: { email: staffEmail },
      update: {},
      create: { email: staffEmail, name, roleId: roleIds[role], passwordHash: await argon2.hash(password) },
    });
  }

  const units = [
    ['pcs', t('ອັນ', 'Piece')],
    ['kg', t('ກິໂລ', 'Kilogram')],
    ['box', t('ກັບ', 'Box')],
    ['l', t('ລິດ', 'Litre')],
  ] as const;
  for (const [code, name] of units) {
    await prisma.unit.upsert({ where: { code }, update: {}, create: { code, name } });
  }

  const categories = [
    ['food', t('ອາຫານ', 'Food & Grocery')],
    ['fashion', t('ແຟຊັ່ນ', 'Fashion')],
    ['electronics', t('ເອເລັກໂຕຣນິກ', 'Electronics')],
    ['home', t('ເຄື່ອງໃຊ້ໃນເຮືອນ', 'Home & Living')],
    ['beauty', t('ຄວາມງາມ', 'Health & Beauty')],
    ['baby', t('ແມ່ ແລະ ເດັກ', 'Mother & Baby')],
    ['pets', t('ສັດລ້ຽງ', 'Pets')],
    ['sports', t('ກິລາ', 'Sports & Outdoors')],
  ] as const;
  for (const [i, [slug, name]] of categories.entries()) {
    await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { slug, name, sortOrder: i },
    });
  }

  await prisma.deliveryProvider.upsert({
    where: { code: 'manual' },
    update: {},
    create: { code: 'manual', name: 'Shop delivery (manual)', mode: 'manual' },
  });

  for (const [slug, content] of Object.entries(DEMO_PAGES)) {
    const existing = await prisma.cmsPage.findUnique({ where: { slug } });
    // Fill pages that are still the empty stubs of older seeds; never overwrite edits.
    const blank = !existing || !(existing.content as { lo?: { body?: string } }).lo?.body;
    if (blank) await prisma.cmsPage.upsert({ where: { slug }, update: { content }, create: { slug, content } });
  }

  const settings: Record<string, unknown> = {
    currency: 'LAK',
    defaultLocale: 'lo',
    locales: ['lo', 'en'],
    timezone: 'Asia/Vientiane',
    taxRate: 0,
    defaultCommissionRate: 5,
    productModeration: 'pre',
    points: { earnPer: 10000, redeemValue: 100, expiryDays: 365 },
    orderDeadlines: { maxExtensions: 2, extensionHours: 48 },
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as object },
    });
  }

  await seedDemoCatalog();

  // Demo shopper with an order in every status and a notification inbox — sign in with 020 9999 0000.
  const demoCustomer = await prisma.customer.upsert({
    where: { phone: '+8562099990000' },
    update: {},
    create: { name: 'Demo Customer', phone: '+8562099990000', phoneVerifiedAt: new Date() },
  });
  // Upgrade the demo address from older seeds (free-text province/label) to codes.
  await prisma.address.updateMany({
    where: { customerId: demoCustomer.id, province: 'Vientiane Capital' },
    data: { province: 'VT', label: 'HOME' },
  });
  const orderTargets = [demoCustomer];
  // Optionally give your own account the same history and inbox: SEED_ORDERS_FOR_PHONE="020 5555 1234"
  if (process.env.SEED_ORDERS_FOR_PHONE) {
    const phone = normalizePhone(process.env.SEED_ORDERS_FOR_PHONE);
    const own = phone && (await prisma.customer.findUnique({ where: { phone } }));
    if (own) orderTargets.push(own);
    else console.warn(`SEED_ORDERS_FOR_PHONE: no customer registered with ${process.env.SEED_ORDERS_FOR_PHONE}`);
  }
  for (const customer of orderTargets) {
    const created = await seedDemoOrders(prisma, customer.id);
    if (created) console.log(`Added ${created} demo orders for ${customer.phone}`);
    const notified = await seedDemoNotifications(prisma, customer.id);
    if (notified) console.log(`Added ${notified} demo notifications for ${customer.phone}`);
  }

  const demoShop = await prisma.shop.findUniqueOrThrow({ where: { slug: 'talad-demo' } });
  await seedDemoShopExtras(prisma, demoShop.id, orderTargets.map((c) => c.id));

  console.log(`Seeded. Admin login: ${email}`);
}

/** A demo shop with published products so the storefront has something to show. */
async function seedDemoCatalog() {
  const description =
    'Everyday essentials and local favourites from around Laos — coffee from the Bolaven Plateau, ' +
    'handwoven silk, kitchen staples and more. Demo shop for development.';
  // Shops belong to ordinary accounts: the owner signs in with 020 8888 0000 and can
  // buy from other shops (but not their own).
  const owner = await prisma.customer.upsert({
    where: { phone: '+8562088880000' },
    update: {},
    create: { name: 'Demo Shop Owner', phone: '+8562088880000', phoneVerifiedAt: new Date() },
  });
  const shop = await prisma.shop.upsert({
    where: { slug: 'talad-demo' },
    update: { description, ownerId: owner.id, name: 'Taladonline Demo Shop' },
    create: {
      slug: 'talad-demo',
      name: 'Taladonline Demo Shop',
      ownerName: 'Demo Owner',
      email: 'demo-shop@talad.local',
      phone: '+8562000000000',
      ownerId: owner.id,
      status: 'APPROVED',
      verifiedAt: new Date(),
      description,
    },
  });

  await seedShopPayment(shop.id, shop.paymentQrKey);
  await seedDelivery();
  await seedCoupons(shop.id);

  const units = Object.fromEntries(
    (await prisma.unit.findMany()).map((u) => [u.code, u.id]),
  );
  const categories = Object.fromEntries(
    (await prisma.category.findMany()).map((c) => [c.slug, c.id]),
  );

  // [slug, name, category, unit, price, compareAtPrice, soldCount]
  const products = [
    ['bolaven-arabica-500g', 'Bolaven Arabica coffee beans 500 g', 'food', 'pcs', 95000, 120000, 820],
    ['sticky-rice-5kg', 'Premium Lao sticky rice 5 kg', 'food', 'pcs', 65000, null, 640],
    ['jeow-bong-chili-paste', 'Jeow bong chili paste, homemade 250 g', 'food', 'pcs', 35000, null, 515],
    ['handwoven-silk-sinh', 'Handwoven Lao silk sinh skirt', 'fashion', 'pcs', 450000, 520000, 210],
    ['cotton-tshirt-basic', 'Everyday cotton T-shirt, unisex', 'fashion', 'pcs', 79000, 99000, 390],
    ['wireless-earbuds', 'Wireless Bluetooth earbuds with charging case', 'electronics', 'pcs', 289000, 350000, 305],
    ['power-bank-20000', 'Power bank 20,000 mAh fast charge', 'electronics', 'pcs', 199000, null, 280],
    ['bamboo-rice-basket', 'Bamboo sticky rice basket (tip khao)', 'home', 'pcs', 45000, null, 450],
    ['coconut-oil-450ml', 'Cold-pressed coconut oil 450 ml', 'beauty', 'pcs', 85000, 105000, 360],
    ['baby-wipes-80', 'Gentle baby wipes, 80 sheets × 3', 'baby', 'box', 55000, null, 330],
    ['cat-food-1kg', 'Dry cat food, tuna flavour 1 kg', 'pets', 'kg', 69000, 79000, 190],
    ['yoga-mat-6mm', 'Non-slip yoga mat 6 mm', 'sports', 'pcs', 159000, 199000, 150],
  ] as const;

  // Options for a few products, to exercise variant selection and price ranges.
  // [sku suffix, attributes, price (null = product price), stock]
  const variants: Record<string, [string, Record<string, string>, number | null, number][]> = {
    'bolaven-arabica-500g': [
      ['250G', { size: '250 g' }, 55000, 40],
      ['500G', { size: '500 g' }, null, 34],
      ['1KG', { size: '1 kg' }, 180000, 12],
    ],
    'sticky-rice-5kg': [
      ['1BAG', { pack: '1 bag' }, null, 60],
      ['4BAG', { pack: 'Set of 4 bags' }, 245000, 15],
    ],
    'cotton-tshirt-basic': [
      ['S', { size: 'S' }, null, 20],
      ['M', { size: 'M' }, null, 25],
      ['L', { size: 'L' }, null, 18],
      ['XL', { size: 'XL' }, 85000, 0],
    ],
  };

  for (const [i, [slug, name, category, unit, price, compareAtPrice, soldCount]] of products.entries()) {
    const description =
      `${name}. Demo listing from Taladonline Demo Shop — replace with real product ` +
      `details (materials, size, origin, care instructions) when onboarding shops.`;
    const videoKey = DEMO_PRODUCT_VIDEOS[slug]?.url;
    const product = await prisma.product.upsert({
      where: { shopId_slug: { shopId: shop.id, slug } },
      update: { description, videoKey },
      create: {
        shopId: shop.id,
        categoryId: categories[category],
        unitId: units[unit],
        slug,
        sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
        name,
        description,
        videoKey,
        price,
        compareAtPrice,
        stock: 100,
        soldCount,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - i * 86_400_000),
      },
    });

    const images = DEMO_PRODUCT_IMAGES[slug] ?? [];
    if (images.length && !(await prisma.productImage.count({ where: { productId: product.id } }))) {
      await prisma.productImage.createMany({
        data: images.map((img, sortOrder) => ({ productId: product.id, key: img.url, sortOrder })),
      });
    }

    for (const [suffix, attributes, variantPrice, stock] of variants[slug] ?? []) {
      const sku = `${product.sku}-${suffix}`;
      await prisma.productVariant.upsert({
        where: { productId_sku: { productId: product.id, sku } },
        update: {},
        create: { productId: product.id, sku, attributes, price: variantPrice, stock },
      });
    }
  }
}

/**
 * Demo transfer details for the demo shop, with a generated QR that clearly says it
 * is not a real account. The QR goes to the Bunny storage zone (s-<shopId>/profile/);
 * without Bunny settings only the account details are saved.
 */
async function seedShopPayment(shopId: string, existingQrKey: string | null) {
  const account = {
    paymentBankCode: 'BCEL',
    paymentAccountName: 'TALAD DEMO SHOP',
    paymentAccountNumber: '0101200099999999',
  };
  // Re-upload QR keys from before the Bunny layout (they don't exist in the zone).
  if (existingQrKey?.startsWith(`s-${shopId}/profile/`)) return;

  let paymentQrKey: string | null = null;
  const { BUNNY_STORAGE_ZONE, BUNNY_API_KEY, BUNNY_BASE_HOSTNAME = 'storage.bunnycdn.com' } = process.env;
  if (BUNNY_STORAGE_ZONE && BUNNY_API_KEY) {
    try {
      const png = await QRCode.toBuffer('DEMO ONLY - Taladonline Demo Shop - not a real bank account', {
        width: 512,
        margin: 2,
      });
      // Same layout as services/api/src/modules/media/storage-keys.ts.
      const key = `s-${shopId}/profile/payment-qr-${randomUUID()}.png`;
      const host = BUNNY_BASE_HOSTNAME.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const res = await fetch(`https://${host}/${BUNNY_STORAGE_ZONE}/${key}`, {
        method: 'PUT',
        headers: {
          AccessKey: BUNNY_API_KEY,
          'Content-Type': 'image/png',
          Checksum: createHash('sha256').update(png).digest('hex').toUpperCase(),
        },
        body: new Uint8Array(png),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      paymentQrKey = key;
    } catch (e) {
      console.warn(`Demo shop QR not uploaded to Bunny: ${(e as Error).message}`);
    }
  }
  await prisma.shop.update({ where: { id: shopId }, data: { ...account, paymentQrKey } });
}

/**
 * Couriers customers pick at checkout, in the order they are offered. Each covers the
 * whole country; no fee is set because the customer pays the courier directly (no
 * courier APIs yet). Logos are served by the web app (apps/web/public/logos).
 */
async function seedDelivery() {
  const couriers = [
    { code: 'ANOUSITH', name: 'Anousith Express', logoUrl: '/logos/anousith-express.png' },
    { code: 'MIXAY', name: 'Mixay Express', logoUrl: '/logos/mixay-express.png' },
    { code: 'HAL', name: 'HAL Express', logoUrl: '/logos/hal-express.jpeg' },
  ];
  for (const c of couriers) {
    const provider = await prisma.deliveryProvider.upsert({
      where: { code: c.code },
      update: { name: c.name, logoUrl: c.logoUrl },
      create: { code: c.code, name: c.name, logoUrl: c.logoUrl },
    });
    await prisma.shippingZone.deleteMany({ where: { deliveryProviderId: provider.id } });
    await prisma.shippingZone.create({
      data: { deliveryProviderId: provider.id, name: 'Nationwide', provinces: [], baseFee: 0 },
    });
  }
}

/** Demo codes: one platform-wide, one from the demo shop. Valid for a year from seeding. */
async function seedCoupons(shopId: string) {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 365 * 24 * 3600 * 1000);
  const coupons = [
    // 10% off, at most ₭30,000, once per customer.
    { shopId: null, code: 'TALAD10', type: 'PERCENTAGE' as const, value: 10, minOrderAmount: 100_000, maxDiscount: 30_000, perCustomer: 1 },
    // ₭20,000 off the demo shop's items from ₭150,000.
    { shopId, code: 'DEMO20K', type: 'FIXED_AMOUNT' as const, value: 20_000, minOrderAmount: 150_000, maxDiscount: null, perCustomer: null },
  ];
  for (const c of coupons) {
    // (shopId, code) is unique, but a null shopId can't be used in an upsert key.
    const existing = await prisma.coupon.findFirst({ where: { shopId: c.shopId, code: c.code } });
    if (existing) await prisma.coupon.update({ where: { id: existing.id }, data: { ...c, isActive: true } });
    else await prisma.coupon.create({ data: { ...c, startsAt, endsAt } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
