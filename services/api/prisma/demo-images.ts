/**
 * Demo product photos for the development seed, hot-linked from Wikimedia Commons.
 * All are free-licensed; CC BY / CC BY-SA images require attribution, so keep the
 * credits below with the data. Replace with shop-uploaded images in production.
 */
export interface DemoImage {
  url: string;
  /** Commons file page — license and full attribution. */
  source: string;
  license: string;
  author: string;
}

export const DEMO_PRODUCT_IMAGES: Record<string, DemoImage[]> = {
  'bolaven-arabica-500g': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Roasted_coffee_beans.jpg/960px-Roasted_coffee_beans.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Roasted_coffee_beans.jpg',
      license: 'Public domain',
      author: 'MarkSweep',
    },
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/Roasted_coffee_beans_in_white_bowl.png/960px-Roasted_coffee_beans_in_white_bowl.png',
      source: 'https://commons.wikimedia.org/wiki/File:Roasted_coffee_beans_in_white_bowl.png',
      license: 'CC BY 4.0',
      author: 'Alorin',
    },
  ],
  'sticky-rice-5kg': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Lao_sticky_rice.jpg/960px-Lao_sticky_rice.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Lao_sticky_rice.jpg',
      license: 'CC BY-SA 2.0',
      author: 'Thomas Wanhoff',
    },
  ],
  'jeow-bong-chili-paste': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5d/Jeow_Bong_-_Laotian_chili_dip.jpg/960px-Jeow_Bong_-_Laotian_chili_dip.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Jeow_Bong_-_Laotian_chili_dip.jpg',
      license: 'CC BY-SA 4.0',
      author: 'Isan1985',
    },
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Jeow_Bong_with_sticky_rice.jpg/960px-Jeow_Bong_with_sticky_rice.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Jeow_Bong_with_sticky_rice.jpg',
      license: 'CC BY-SA 4.0',
      author: 'Isan1985',
    },
  ],
  'handwoven-silk-sinh': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/85/Lao_Textile_Museum_9.jpg/960px-Lao_Textile_Museum_9.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Lao_Textile_Museum_9.jpg',
      license: 'CC0',
      author: 'Mx. Granger',
    },
  ],
  'cotton-tshirt-basic': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Grey_Tshirt.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Grey_Tshirt.jpg',
      license: 'CC BY-SA 3.0',
      author: 'Camisetas',
    },
  ],
  'wireless-earbuds': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/ActiveSound_wireless_earbuds_by_Hykker_%28POJM200483%29.jpg/960px-ActiveSound_wireless_earbuds_by_Hykker_%28POJM200483%29.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:ActiveSound_wireless_earbuds_by_Hykker_(POJM200483).jpg',
      license: 'Public domain',
      author: 'User:WrS.tm.pl',
    },
  ],
  'power-bank-20000': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Portable_power_bank.jpg/960px-Portable_power_bank.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Portable_power_bank.jpg',
      license: 'CC BY-SA 4.0',
      author: 'Santeri Viinamäki',
    },
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Charging_a_smartphone_with_a_USB_power_bank.jpg/960px-Charging_a_smartphone_with_a_USB_power_bank.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Charging_a_smartphone_with_a_USB_power_bank.jpg',
      license: 'CC BY-SA 4.0',
      author: 'Mk2010',
    },
  ],
  'bamboo-rice-basket': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Thai_bamboo_container_with_lid_%28for_serving_sticky_rice%29.jpg/960px-Thai_bamboo_container_with_lid_%28for_serving_sticky_rice%29.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Thai_bamboo_container_with_lid_(for_serving_sticky_rice).jpg',
      license: 'CC BY-SA 4.0',
      author: 'Susan Slater',
    },
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6c/Different_Kratip_Khao.jpg/960px-Different_Kratip_Khao.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Different_Kratip_Khao.jpg',
      license: 'Public domain',
      author: 'User:Mattes',
    },
  ],
  'coconut-oil-450ml': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/Coconut_oil_bottle_in_the_background_of_coconuts_from_Kaleeswari_Farm.jpg/960px-Coconut_oil_bottle_in_the_background_of_coconuts_from_Kaleeswari_Farm.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Coconut_oil_bottle_in_the_background_of_coconuts_from_Kaleeswari_Farm.jpg',
      license: 'CC BY-SA 4.0',
      author: 'deadrat',
    },
  ],
  'baby-wipes-80': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Baby_wipes.jpg/960px-Baby_wipes.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Baby_wipes.jpg',
      license: 'CC BY 4.0',
      author: 'Headlock0225',
    },
  ],
  'cat-food-1kg': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/26/Dry_cat_food_01.jpg/960px-Dry_cat_food_01.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Dry_cat_food_01.jpg',
      license: 'CC BY-SA 4.0',
      author: 'Anne Jea.',
    },
  ],
  'yoga-mat-6mm': [
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Yoga_mat.jpg/960px-Yoga_mat.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Yoga_mat.jpg',
      license: 'CC BY-SA 4.0',
      author: 'Gausanchennai',
    },
    {
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Yoga_mats.png/960px-Yoga_mats.png',
      source: 'https://commons.wikimedia.org/wiki/File:Yoga_mats.png',
      license: 'CC0',
      author: 'Sha89sha',
    },
  ],
};
