/**
 * Demo product videos for the development seed (the storefront Feed), hot-linked from
 * Wikimedia Commons 480p transcodes. Both are CC BY-SA, so keep the credits below with
 * the data. Replace with shop-uploaded videos in production.
 */
import type { DemoImage } from './demo-images.js';

export const DEMO_PRODUCT_VIDEOS: Record<string, DemoImage> = {
  'bolaven-arabica-500g': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/95/Traditional_Ethiopian_Coffee_Roasting_Ceremony.webm/Traditional_Ethiopian_Coffee_Roasting_Ceremony.webm.480p.vp9.webm',
    source: 'https://commons.wikimedia.org/wiki/File:Traditional_Ethiopian_Coffee_Roasting_Ceremony.webm',
    license: 'CC BY-SA 4.0',
    author: 'Keria T',
  },
  'coconut-oil-450ml': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d1/Cold_Pressed_Coconut_Oil_Extraction.webm/Cold_Pressed_Coconut_Oil_Extraction.webm.480p.vp9.webm',
    source: 'https://commons.wikimedia.org/wiki/File:Cold_Pressed_Coconut_Oil_Extraction.webm',
    license: 'CC BY-SA 4.0',
    author: 'Thamizhpparithi Maari',
  },
};
