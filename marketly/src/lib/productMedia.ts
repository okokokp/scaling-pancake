import catConsolesImg from '../assets/images/cat_consoles_gear_1795387110371.jpg';
import catPcPartsImg from '../assets/images/cat_pc_parts_1795387110732.jpg';
import catPeripheralsImg from '../assets/images/cat_peripherals_setup_1795387111597.jpg';
import catPhonesImg from '../assets/images/cat_phones_audio_1795387110703.jpg';
import heroMarketlyImg from '../assets/images/hero_marketly_tech_1795387110600.jpg';
import promoSpotlightImg from '../assets/images/promo_ebay_spotlight_1795387111279.jpg';
import quotePortraitImg from '../assets/images/quote_tech_portrait_1795368169660.jpg';
import { normalizeCategoryId } from '../../shared/taxonomy';

export const MARKETLY_MEDIA = {
  heroShowcase: heroMarketlyImg,
  promoSpotlight: promoSpotlightImg,
  quotePortrait: quotePortraitImg,
  categories: {
    'cat-pc-parts': catPcPartsImg,
    'cat-phones': catPhonesImg,
    'cat-consoles': catConsolesImg,
    'cat-peripherals': catPeripheralsImg,
  } as Record<string, string>,
};

export function resolveProductPhoto(options: {
  imageUrl?: string | null;
  imageKey?: string;
  categoryId?: string;
  productName?: string;
}): string {
  const { imageUrl, imageKey, categoryId, productName } = options;
  if (imageUrl && imageUrl.trim()) {
    return imageUrl.trim();
  }

  const key = (imageKey || '').toLowerCase();
  if (['console', 'controller', 'headset'].includes(key)) {
    return catConsolesImg;
  }
  if (['phone', 'phone-android', 'charger', 'case', 'powerbank', 'earbuds'].includes(key)) {
    return catPhonesImg;
  }
  if (['monitor', 'keyboard', 'mouse', 'router'].includes(key)) {
    return catPeripheralsImg;
  }
  if (['gpu', 'cpu', 'ssd', 'ram', 'psu', 'cooler', 'pc-case'].includes(key)) {
    return catPcPartsImg;
  }

  const canonicalCat = normalizeCategoryId(categoryId, {
    imageKey,
    name: productName,
  });
  return MARKETLY_MEDIA.categories[canonicalCat] || catPcPartsImg;
}
