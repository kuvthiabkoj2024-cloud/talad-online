import type { OrderStatus } from '../../generated/prisma/client.js';

type Text = { title: string; body: string };

/** Order status → customer message; `{n}` is the order number, `{shop}` the shop name. */
const ORDER_TEXT: Record<OrderStatus, { lo: Text; en: Text }> = {
  PENDING: {
    lo: { title: 'ສັ່ງຊື້ສຳເລັດ', body: 'ຄຳສັ່ງຊື້ {n} ຂອງທ່ານຖືກສ້າງແລ້ວ. ກະລຸນາຊຳລະເງິນກ່ອນໝົດເວລາ.' },
    en: { title: 'Order placed', body: 'Your order {n} has been placed. Please complete payment before the deadline.' },
  },
  CONFIRMED: {
    lo: { title: 'ຊຳລະເງິນແລ້ວ', body: 'Taladonline ຢືນຢັນການຊຳລະຂອງຄຳສັ່ງຊື້ {n} ແລ້ວ. {shop} ກຳລັງກະກຽມສິນຄ້າ.' },
    en: { title: 'Payment confirmed', body: 'Taladonline confirmed the payment for order {n}. {shop} is preparing it.' },
  },
  PACKED: {
    lo: { title: 'ແພັກສິນຄ້າແລ້ວ', body: 'ຄຳສັ່ງຊື້ {n} ແພັກແລ້ວ ແລະ ລໍຖ້າຂົນສົ່ງມາຮັບ.' },
    en: { title: 'Order packed', body: 'Your order {n} is packed and waiting for the courier.' },
  },
  SHIPPED: {
    lo: { title: 'ສົ່ງສິນຄ້າແລ້ວ', body: 'ຄຳສັ່ງຊື້ {n} ກຳລັງເດີນທາງໄປຫາທ່ານ. ກົດ "ໄດ້ຮັບສິນຄ້າແລ້ວ" ເມື່ອໄດ້ຮັບ (ຈະສຳເລັດເອງພາຍໃນ 7 ມື້).' },
    en: { title: 'Order sent', body: 'Your order {n} is on its way. Tap "Received" when it arrives (it completes on its own after 7 days).' },
  },
  DELIVERED: {
    lo: { title: 'ຈັດສົ່ງສຳເລັດ', body: 'ຄຳສັ່ງຊື້ {n} ຈັດສົ່ງຮອດແລ້ວ. ກະລຸນາຢືນຢັນການຮັບສິນຄ້າ.' },
    en: { title: 'Order delivered', body: 'Your order {n} was delivered. Please confirm you received it.' },
  },
  COMPLETED: {
    lo: { title: 'ຄຳສັ່ງຊື້ສຳເລັດ', body: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ! ໃຫ້ຄະແນນສິນຄ້າຈາກຄຳສັ່ງຊື້ {n}.' },
    en: { title: 'Order completed', body: 'Thanks for shopping! Rate the items from order {n}.' },
  },
  CANCELLED: {
    lo: { title: 'ຄຳສັ່ງຊື້ຖືກຍົກເລີກ', body: 'ຄຳສັ່ງຊື້ {n} ຖືກຍົກເລີກແລ້ວ.' },
    en: { title: 'Order cancelled', body: 'Order {n} was cancelled.' },
  },
  RETURN_REQUESTED: {
    lo: { title: 'ສົ່ງຄຳຮ້ອງຂໍຄືນສິນຄ້າແລ້ວ', body: 'ພວກເຮົາໄດ້ຮັບຄຳຮ້ອງຂໍຄືນສິນຄ້າຂອງຄຳສັ່ງຊື້ {n} ແລ້ວ. ຮ້ານຈະຕອບກັບພາຍໃນ 48 ຊົ່ວໂມງ.' },
    en: { title: 'Return requested', body: "We've received your return request for order {n}. The shop will reply within 48 hours." },
  },
};

/** A pickup order isn't sent: "shipped" means it is ready to collect at the shop. */
const READY_FOR_PICKUP = {
  lo: { title: 'ພ້ອມໃຫ້ໄປຮັບແລ້ວ', body: 'ຄຳສັ່ງຊື້ {n} ພ້ອມແລ້ວ, ໄປຮັບໄດ້ທີ່ {shop}. ກົດ "ໄດ້ຮັບສິນຄ້າແລ້ວ" ເມື່ອຮັບແລ້ວ (ຈະສຳເລັດເອງພາຍໃນ 7 ມື້).' },
  en: { title: 'Ready for pickup', body: 'Your order {n} is ready to collect at {shop}. Tap "Received" once you have it (it completes on its own after 7 days).' },
};

/** Lao and English text for an order notification; `reason` (as written by the shop) is appended. */
export function orderMessage(status: OrderStatus, number: string, shop: string, reason?: string | null, pickup = false): { lo: Text; en: Text } {
  const fill = (t: Text, label: string): Text => {
    const sub = (s: string) => s.replace('{n}', number).replace('{shop}', shop);
    return { title: sub(t.title), body: sub(t.body) + (reason ? ` ${label}: ${reason}` : '') };
  };
  const text = pickup && status === 'SHIPPED' ? READY_FOR_PICKUP : ORDER_TEXT[status];
  return { lo: fill(text.lo, 'ເຫດຜົນ'), en: fill(text.en, 'Reason') };
}
