import type { OrderStatus } from '../../generated/prisma/client.js';

type Text = { title: string; body: string };

/** Order status → customer message; `{n}` is the order number, `{shop}` the shop name. */
const ORDER_TEXT: Record<OrderStatus, { lo: Text; en: Text }> = {
  PENDING: {
    lo: { title: 'ສັ່ງຊື້ສຳເລັດ', body: 'ຄຳສັ່ງຊື້ {n} ຂອງທ່ານຖືກສ້າງແລ້ວ. ກະລຸນາຊຳລະເງິນກ່ອນໝົດເວລາ.' },
    en: { title: 'Order placed', body: 'Your order {n} has been placed. Please complete payment before the deadline.' },
  },
  CONFIRMED: {
    lo: { title: 'ຮ້ານຢືນຢັນຄຳສັ່ງຊື້ແລ້ວ', body: '{shop} ໄດ້ຢືນຢັນຄຳສັ່ງຊື້ {n} ແລະ ກຳລັງກະກຽມສິນຄ້າ.' },
    en: { title: 'Order confirmed', body: '{shop} confirmed your order {n} and is preparing it.' },
  },
  PACKED: {
    lo: { title: 'ແພັກສິນຄ້າແລ້ວ', body: 'ຄຳສັ່ງຊື້ {n} ແພັກແລ້ວ ແລະ ລໍຖ້າຂົນສົ່ງມາຮັບ.' },
    en: { title: 'Order packed', body: 'Your order {n} is packed and waiting for the courier.' },
  },
  SHIPPED: {
    lo: { title: 'ກຳລັງຈັດສົ່ງ', body: 'ຄຳສັ່ງຊື້ {n} ກຳລັງເດີນທາງໄປຫາທ່ານ.' },
    en: { title: 'Order shipped', body: 'Your order {n} is on its way.' },
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

/** Lao and English text for an order notification; `reason` (as written by the shop) is appended. */
export function orderMessage(status: OrderStatus, number: string, shop: string, reason?: string | null): { lo: Text; en: Text } {
  const fill = (t: Text, label: string): Text => {
    const sub = (s: string) => s.replace('{n}', number).replace('{shop}', shop);
    return { title: sub(t.title), body: sub(t.body) + (reason ? ` ${label}: ${reason}` : '') };
  };
  return { lo: fill(ORDER_TEXT[status].lo, 'ເຫດຜົນ'), en: fill(ORDER_TEXT[status].en, 'Reason') };
}
