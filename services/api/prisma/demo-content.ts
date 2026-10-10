/**
 * Starter text for the storefront's legal/help pages (CMS, §2.11). Placeholder copy for
 * development — have the real terms and privacy policy written and reviewed before launch.
 */
type Page = { title: string; body: string };

export const DEMO_PAGES: Record<string, { lo: Page; en: Page }> = {
  about: {
    lo: {
      title: 'ກ່ຽວກັບພວກເຮົາ',
      body: 'Taladonline ແມ່ນຕະຫຼາດອອນລາຍຂອງລາວ ທີ່ເຊື່ອມຕໍ່ຮ້ານຄ້າທ້ອງຖິ່ນກັບລູກຄ້າທົ່ວປະເທດ.\n\n# ພາລະກິດຂອງພວກເຮົາ\nຊ່ວຍໃຫ້ຜູ້ຂາຍລາວເຕີບໂຕ ແລະ ໃຫ້ລູກຄ້າຊື້ສິນຄ້າທີ່ໄວ້ໃຈໄດ້ຢ່າງງ່າຍດາຍ.',
    },
    en: {
      title: 'About us',
      body: 'Taladonline is a Lao online marketplace connecting local shops with customers across the country.\n\n# Our mission\nHelp Lao sellers grow, and make it easy for customers to buy from shops they can trust.',
    },
  },
  terms: {
    lo: {
      title: 'ຂໍ້ກຳນົດ ແລະ ເງື່ອນໄຂ',
      body: '# ການໃຊ້ບໍລິການ\nເມື່ອໃຊ້ Taladonline ທ່ານຍອມຮັບເງື່ອນໄຂເຫຼົ່ານີ້.\n\n# ຄຳສັ່ງຊື້ ແລະ ການຊຳລະ\nແຕ່ລະຮ້ານຮັບຜິດຊອບສິນຄ້າ ແລະ ການຈັດສົ່ງຂອງຕົນ. ການຊຳລະຕ້ອງເຮັດພາຍໃນເວລາທີ່ກຳນົດ.\n\n# ການຄືນສິນຄ້າ\nທ່ານສາມາດຂໍຄືນສິນຄ້າໄດ້ຫຼັງໄດ້ຮັບສິນຄ້າ ຕາມນະໂຍບາຍຂອງຮ້ານ ແລະ Taladonline.',
    },
    en: {
      title: 'Terms & Conditions',
      body: '# Using Taladonline\nBy using Taladonline you agree to these terms.\n\n# Orders and payment\nEach shop is responsible for its products and delivery. Payment must be made within the shown deadline.\n\n# Returns\nYou can request a return after delivery, following the shop’s and Taladonline’s policy.',
    },
  },
  privacy: {
    lo: {
      title: 'ນະໂຍບາຍຄວາມເປັນສ່ວນຕົວ',
      body: '# ຂໍ້ມູນທີ່ພວກເຮົາເກັບ\nຊື່, ເບີໂທ, ທີ່ຢູ່ຈັດສົ່ງ ແລະ ປະຫວັດການສັ່ງຊື້ ເພື່ອໃຫ້ບໍລິການ.\n\n# ການແບ່ງປັນ\nພວກເຮົາແບ່ງປັນຂໍ້ມູນທີ່ຈຳເປັນໃຫ້ຮ້ານ ແລະ ບໍລິສັດຂົນສົ່ງ ເພື່ອຈັດສົ່ງຄຳສັ່ງຊື້ຂອງທ່ານເທົ່ານັ້ນ.',
    },
    en: {
      title: 'Privacy Policy',
      body: '# What we collect\nYour name, phone number, delivery addresses and order history, to provide the service.\n\n# Sharing\nWe share only what shops and couriers need to deliver your orders.',
    },
  },
  faq: {
    lo: {
      title: 'ຄຳຖາມທີ່ພົບເລື້ອຍ',
      body: '# ຂ້ອຍຈະຊຳລະເງິນແນວໃດ?\nໂອນຜ່ານທະນາຄານ (ສະແກນ QR ແລ້ວອັບໂຫຼດສະລິບ) ຫຼື ເກັບເງິນປາຍທາງ.\n\n# ຂ້ອຍຈະເປີດຮ້ານໄດ້ແນວໃດ?\nກົດ “ຂາຍໃນ Taladonline” ແລ້ວສົ່ງຄຳຮ້ອງ. ພວກເຮົາກວດສອບພາຍໃນ 1–2 ວັນລັດຖະການ.',
    },
    en: {
      title: 'FAQ',
      body: '# How do I pay?\nBy bank transfer (scan the QR, then upload the slip) or cash on delivery.\n\n# How do I open a shop?\nTap “Sell on Taladonline” and send an application. We review it within 1–2 working days.',
    },
  },
};
