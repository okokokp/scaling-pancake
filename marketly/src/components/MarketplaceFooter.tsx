import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LanguageCode } from '../../shared/types.ts';

interface LocalizedTopicCopy {
  section: string;
  title: string;
  summary: string;
  bullets: string[];
}

interface FooterTopicContent {
  id: string;
  recommendedRole: 'customer' | 'seller';
  en: LocalizedTopicCopy;
  ar: LocalizedTopicCopy;
}

const FOOTER_TOPICS: Record<string, FooterTopicContent> = {
  company_overview: {
    id: 'company_overview',
    recommendedRole: 'customer',
    en: {
      section: 'About',
      title: 'About Marketly Djelfa',
      summary:
        'Marketly connects Djelfa shoppers with verified brick-and-mortar tech shops and trusted local online storefronts—giving you live DZD prices, stock timestamps, and fast courier or in-store pickup.',
      bullets: [
        'Direct local inventory across PC parts, gaming consoles, smartphones, and everyday peripherals.',
        'Transparent Cash on Delivery (COD) and in-store pickup options with 4-digit delivery verification.',
        'Built for Djelfa neighborhoods including Centre-Ville, Boulevard de l’ALN, Cité 05 Juillet, Ain Chih, and Berbih.',
      ],
    },
    ar: {
      section: 'حول المنصة',
      title: 'حول ماركتلي الجلفة',
      summary:
        'يربط ماركتلي متسوقي الجلفة بمتاجر التقنية الفعلية المعتمدة والصفحات الإلكترونية المحلية الموثوقة—مع أسعار فورية بالدينار الجزائري وحالة توفر محدثة وتوصيل سريع أو استلام من المحل.',
      bullets: [
        'مخزون محلي مباشر لقطع الحاسوب وأجهزة الألعاب والهواتف الذكية والملحقات اليومية.',
        'خيارات شفافة للدفع عند الاستلام أو الاستلام من المتجر مع رمز تحقق من 4 أرقام.',
        'مصمم لأحياء الجلفة: وسط المدينة، شارع جيش التحرير الوطني، حي 05 جويلية، عين الشيح، وبربيح.',
      ],
    },
  },
  djelfa_story: {
    id: 'djelfa_story',
    recommendedRole: 'customer',
    en: {
      section: 'About',
      title: 'Our Djelfa Local Story',
      summary:
        'Born to solve a simple local frustration: knowing which shop in Djelfa actually has the exact GPU, SSD, console, or smartphone charger in stock today—before crossing town.',
      bullets: [
        'Every storefront displays real working hours, Djelfa street location, and direct phone/WhatsApp links.',
        'Local couriers cover short-hop neighborhood dispatches in 1 to 3 hours for urgent hardware needs.',
        'Independent sellers keep full control of their storefront pricing, warranty notes, and customer service.',
      ],
    },
    ar: {
      section: 'حول المنصة',
      title: 'قصتنا المحلية في الجلفة',
      summary:
        'انطلق ماركتلي لحل مشكلة يومية بسيطة: معرفة أي متجر في الجلفة يملك بالفعل البطاقة الرسومية أو القرص الصلب أو الشاحن المطلوب اليوم قبل التنقل عبر المدينة.',
      bullets: [
        'يعرض كل متجر ساعات العمل الحقيقية وموقع الشارع في الجلفة وروابط الهاتف والواتساب المباشرة.',
        'يغطي السائقون المحليون التوصيل السريع داخل الأحياء خلال ساعة إلى ثلاث ساعات.',
        'يحتفظ البائعون المستقلون بالتحكم الكامل في أسعارهم وملاحظات الضمان وخدمة الزبائن.',
      ],
    },
  },
  verification_standards: {
    id: 'verification_standards',
    recommendedRole: 'customer',
    en: {
      section: 'About',
      title: 'How Shop & Listing Verification Works',
      summary:
        'Every store and online tech page passes manual review before appearing in Marketly search results.',
      bullets: [
        'Stores submit verified Djelfa location details or active social handles and working phone numbers.',
        'Inventory timestamps older than 24 hours are automatically flagged as unconfirmed until refreshed.',
        'Buyers can flag outdated pricing or stock directly from any product comparison view.',
      ],
    },
    ar: {
      section: 'حول المنصة',
      title: 'معايير توثيق المتاجر والعروض',
      summary:
        'يمر كل متجر وصفحة تقنية أونلاين بمراجعة يدوية قبل الظهور في نتائج البحث على ماركتلي.',
      bullets: [
        'تقدم المتاجر عنواناً موثقاً في الجلفة أو حسابات تواصل نشطة وأرقام هاتف تعمل.',
        'تُوسم تحديثات المخزون الأقدم من 24 ساعة تلقائياً كغير مؤكدة حتى يقوم التاجر بتحديثها.',
        'يمكن للمشترين الإبلاغ عن أي سعر أو مخزون غير محدث مباشرة من نافذة مقارنة المنتجات.',
      ],
    },
  },
  policies: {
    id: 'policies',
    recommendedRole: 'seller',
    en: {
      section: 'About',
      title: 'Marketplace Policies & Buyer Standards',
      summary:
        'Clear ground rules keep transactions fair for both Djelfa buyers and independent tech merchants.',
      bullets: [
        'Listed prices must match the DZD checkout or counter pickup total with no hidden surcharges.',
        'Counterfeit accessories, tampered seals, or misleading product grades result in immediate listing removal.',
        'Sellers commit to honoring posted warranty durations and communicating stock changes promptly.',
      ],
    },
    ar: {
      section: 'حول المنصة',
      title: 'سياسات السوق ومعايير الموثوقية',
      summary:
        'قواعد واضحة تحفظ حقوق المشترين وتجار التقنية المستقلين في الجلفة على حد سواء.',
      bullets: [
        'يجب أن يطابق السعر المعروض إجمالي الدفع بالدينار عند التسليم أو في المتجر دون رسوم مخفية.',
        'يؤدي عرض ملحقات مقلدة أو أختام متلاعب بها إلى إزالة العرض فوراً.',
        'يلتزم التجار باحترام مدد الضمان المعلنة وتحديث حالة المخزون بانتظام.',
      ],
    },
  },
  privacy_care: {
    id: 'privacy_care',
    recommendedRole: 'customer',
    en: {
      section: 'About',
      title: 'Privacy & Data Care',
      summary:
        'We only collect the minimum details required to coordinate local pickup, courier delivery, and private support conversations.',
      bullets: [
        'Your phone number and delivery address are shared only with the fulfilling store and assigned courier.',
        'GPS location requests are strictly optional and used only to compute distances to nearby Djelfa shops.',
        'Support tickets are scoped strictly to the ticket owner and authorized moderators/administrators.',
      ],
    },
    ar: {
      section: 'حول المنصة',
      title: 'الخصوصية وحماية البيانات',
      summary:
        'نجمع الحد الأدنى فقط من المعلومات اللازمة لتنسيق الاستلام المحلي أو التوصيل ومحادثات الدعم الخاصة.',
      bullets: [
        'تُشارك معلومات الهاتف وعنوان التوصيل فقط مع المتجر المنفذ للطلب والسائق المكلف.',
        'طلب تحديد الموقع الجغرافي اختياري تماماً ويُستخدم فقط لحساب المسافة إلى متاجر الجلفة القريبة.',
        'تذاكر الدعم محمية ولا يطلع عليها سوى صاحب التذكرة وفريق الإشراف والإدارة المخوّل.',
      ],
    },
  },
  cod_protection: {
    id: 'cod_protection',
    recommendedRole: 'customer',
    en: {
      section: 'Help & Contact',
      title: 'COD Buyer Protection',
      summary:
        'Pay in cash only when your order arrives at your door or when you inspect it at the shop counter.',
      bullets: [
        'Every delivery receives a private 4-digit confirmation code so orders are handed exclusively to you.',
        'Compare multiple local stores side-by-side before placing an order to verify price and stock freshness.',
        'Need help with an active delivery? Open Help Center chat anytime with your order number (e.g. MK-1041).',
      ],
    },
    ar: {
      section: 'المساعدة والتواصل',
      title: 'حماية المشتري عند الاستلام',
      summary:
        'ادفع نقداً فقط عند وصول طلبك إلى باب منزلك أو بعد معاينته في متجر البائع.',
      bullets: [
        'يحصل كل طلب على رمز تأكيد سري من 4 أرقام لضمان تسليم الطلب لك شخصياً.',
        'قارن عدة متاجر محلية جنباً إلى جنب قبل الطلب للتحقق من السعر وحداثة المخزون.',
        'هل تحتاج مساعدة في طلب نشط؟ افتح محادثة مركز الدعم في أي وقت مع رقم الطلب (مثل MK-1041).',
      ],
    },
  },
  returns_warranty: {
    id: 'returns_warranty',
    recommendedRole: 'customer',
    en: {
      section: 'Help & Contact',
      title: 'Returns & Warranty Guide',
      summary:
        'Inspect hardware condition on pickup or delivery and keep your digital order summary for warranty claims.',
      bullets: [
        'Factory-sealed components (GPUs, SSDs, consoles, smartphones) carry the shop warranty stated on your receipt.',
        'Report DOA (Dead on Arrival) parts within 48 hours via Help Center chat for priority store mediation.',
        'Always test displays, chargers, and peripherals on pickup whenever possible.',
      ],
    },
    ar: {
      section: 'المساعدة والتواصل',
      title: 'دليل الإرجاع والضمان',
      summary:
        'عاين حالة القطع عند الاستلام أو التوصيل واحتفظ بملخص طلبك الرقمي لمراجعات الضمان.',
      bullets: [
        'القطع المختومة مصنعياً (بطاقات الشاشة، SSD، أجهزة الألعاب، الهواتف) تشمل ضمان المتجر الموضح في الفاتورة.',
        'أبلغ عن أي عطل فوري خلال 48 ساعة عبر مركز الدعم للمتابعة العاجلة مع المتجر.',
        'اختبر الشاشات والشواحن والملحقات عند الاستلام متى أمكن ذلك.',
      ],
    },
  },
  safe_pickup: {
    id: 'safe_pickup',
    recommendedRole: 'customer',
    en: {
      section: 'Help & Contact',
      title: 'Safe Local Pickup Tips',
      summary:
        'Practical tips when picking up high-value PC components, consoles, or phones in person.',
      bullets: [
        'Confirm availability status and reserve via Marketly pickup before heading to the store.',
        'Verify serial numbers and seal integrity on graphics cards, SSDs, and sealed smartphones at the counter.',
        'Provide your 4-digit pickup code only after checking the item and receiving your receipt.',
      ],
    },
    ar: {
      section: 'المساعدة والتواصل',
      title: 'نصائح الاستلام الآمن من المتجر',
      summary:
        'إرشادات عملية عند استلام مكونات الحاسوب أو أجهزة الألعاب أو الهواتف مباشرة من المحل.',
      bullets: [
        'تحقق من حالة التوفر واحجز عبر ماركتلي قبل التوجه إلى المتجر.',
        'تأكد من مطابقة الرقم التسلسلي وسلامة الختم المصنعي لبطاقات الرسوميات والهواتف عند الاستلام.',
        'لا تشارك رمز الاستلام المكون من 4 أرقام إلا بعد فحص المنتج واستلام الوصل.',
      ],
    },
  },
  announcements: {
    id: 'announcements',
    recommendedRole: 'customer',
    en: {
      section: 'Community',
      title: 'Platform Announcements & Releases',
      summary:
        'What is new across Marketly Djelfa—unified category navigation, Google Maps store pins, and private role-scoped support tickets.',
      bullets: [
        'Dedicated category sub-parts: jump straight to GPUs, SSD & RAM, Cooling & Cases, or Chargers & Mobile Gear.',
        'Interactive Google Maps Djelfa directory across Centre-Ville, Boulevard de l’ALN, Cité 05 Juillet, Ain Chih, and Berbih.',
        'Direct Customer & Seller Help Center chat connected to dedicated Moderators and Administrators.',
      ],
    },
    ar: {
      section: 'المجتمع',
      title: 'تحديثات وإعلانات المنصة',
      summary:
        'جديد ماركتلي الجلفة—تصفح موحد للأقسام، خرائط Google لمتاجر الجلفة، وتذاكر دعم خاصة ومحميّة.',
      bullets: [
        'تصنيفات فرعية دقيقة: انتقل مباشرة إلى البطاقات الرسومية أو SSD والرام أو الشواحن وملحقات الهاتف.',
        'خريطة تفاعلية عبر خرائط Google لمتاجر الجلفة في وسط المدينة وشارع جيش التحرير و05 جويلية وعين الشيح وبربيح.',
        'محادثة مباشرة لمركز الدعم متصلة بفريق الإشراف والإدارة.',
      ],
    },
  },
  buyers_community: {
    id: 'buyers_community',
    recommendedRole: 'customer',
    en: {
      section: 'Community',
      title: 'Djelfa Tech Buyers Community',
      summary:
        'Verified ratings and real buyer reviews help everyone spot reliable repair counters, PC builders, and phone dealers.',
      bullets: [
        'Leave honest ratings after completing a pickup or courier order to help neighbors shop smarter.',
        'Check price history trends inside the product comparison modal before buying major components.',
        'Share restock requests directly with local shops when specific parts are out of stock.',
      ],
    },
    ar: {
      section: 'المجتمع',
      title: 'مجتمع متسوقي التقنية في الجلفة',
      summary:
        'تساعد التقييمات الحقيقية وآراء المشترين الجميع على اكتشاف أفضل مراكز الصيانة وباعة القطع والهواتف.',
      bullets: [
        'اترك تقييمك بعد إتمام الاستلام أو التوصيل لمساعدة المتسوقين الآخرين في الجلفة.',
        'راجع سجل تغير الأسعار داخل نافذة مقارنة المنتجات قبل شراء القطع الأساسية.',
        'تواصل مع المتاجر المحلية لطلب توفير القطع غير المتوفرة حالياً.',
      ],
    },
  },
  pc_build_tips: {
    id: 'pc_build_tips',
    recommendedRole: 'customer',
    en: {
      section: 'Community',
      title: 'PC Build & Compatibility Tips',
      summary:
        'Quick compatibility checklist before ordering parts from multiple Djelfa hardware shops.',
      bullets: [
        'Match motherboard socket & RAM generation (DDR4 vs DDR5) before checking out.',
        'Verify PSU wattage (650W–750W 80+ Gold recommended for mid-to-high GPUs) and case GPU clearance.',
        'Pair NVMe M.2 Gen4 SSDs with adequate airflow or dual-tower CPU cooling for warm Djelfa summers.',
      ],
    },
    ar: {
      section: 'المجتمع',
      title: 'نصائح تجميع الحاسوب والتوافقية',
      summary:
        'قائمة تحقق سريعة قبل طلب قطع الحاسوب من عدة متاجر في الجلفة.',
      bullets: [
        'تأكد من توافق مقبس اللوحة الأم وجيل الذاكرة (DDR4 أو DDR5) قبل إتمام الطلب.',
        'تحقق من استطاعة مزود الطاقة (650W–750W 80+ Gold) وأبعاد البطاقة الرسومية داخل الصندوق.',
        'ادمج أقراص NVMe Gen4 السريعة مع تبريد هوائي أو مائي مناسب لأجواء الصيف.',
      ],
    },
  },
  partner_updates: {
    id: 'partner_updates',
    recommendedRole: 'seller',
    en: {
      section: 'Community',
      title: 'Seller & Partner Updates',
      summary:
        'Tools and updates for Djelfa shop owners, Instagram/Facebook tech pages, and local delivery couriers.',
      bullets: [
        'Keep stock fresh with 1-click availability stamps or bulk CSV catalog updates inside the Seller Studio.',
        'Generate printable counter QR posters so walk-in buyers can browse your full live catalog anytime.',
        'Reach the Seller Support Desk directly via Help Center chat for catalog or verification requests.',
      ],
    },
    ar: {
      section: 'المجتمع',
      title: 'تحديثات التجار والشركاء',
      summary:
        'أدوات وتحديثات لأصحاب المتاجر في الجلفة وصفحات البيع الإلكترونية وسائقي التوصيل.',
      bullets: [
        'حدّث حالة المخزون بنقرة واحدة أو استورد جداول المنتجات عبر بوابة التاجر.',
        'أنشئ ملصقات QR جاهزة للطباعة لتمكين الزبائن داخل المحل من تصفح كتالوجك المباشر.',
        'تواصل مع مكتب دعم التجار عبر مركز المساعدة لطلبات التوثيق أو إدارة الكتالوج.',
      ],
    },
  },
  terms: {
    id: 'terms',
    recommendedRole: 'customer',
    en: {
      section: 'Legal',
      title: 'Terms of Use',
      summary:
        'Marketly provides local product discovery, price comparison, and order coordination between independent buyers, merchants, and couriers in Djelfa.',
      bullets: [
        'Independent stores remain responsible for product authenticity, warranties, and counter invoices.',
        'Abusive listings, fake stock updates, or repeated unfulfilled orders may result in account suspension.',
      ],
    },
    ar: {
      section: 'الشروط القانونية',
      title: 'شروط الاستخدام',
      summary:
        'يوفر ماركتلي خدمة اكتشاف المنتجات ومقارنة الأسعار وتنسيق الطلبات بين المشترين والتجار والسائقين في الجلفة.',
      bullets: [
        'تبقى المتاجر المستقلة مسؤولة عن أصالة المنتجات والضمانات وفواتير البيع.',
        'قد يؤدي نشر عروض مضللة أو تحديثات مخزون وهمية إلى تعليق الحساب.',
      ],
    },
  },
  accessibility: {
    id: 'accessibility',
    recommendedRole: 'customer',
    en: {
      section: 'Legal',
      title: 'Accessibility Statement',
      summary:
        'We aim to make local commerce easy to browse across English (LTR) and Arabic (RTL) on desktop and mobile.',
      bullets: [
        'High-contrast typography (Outfit & Readex Pro), full keyboard navigation, and reduced-motion respect.',
        'Report any screen-reader or contrast issue through the Help Center chat so we can fix it promptly.',
      ],
    },
    ar: {
      section: 'الشروط القانونية',
      title: 'بيان سهولة الوصول',
      summary:
        'نسعى لجعل التسوق المحلي سهلاً وواضحاً باللغتين العربية (من اليمين لليسار) والإنجليزية على الحاسوب والهاتف.',
      bullets: [
        'تباين لوني عالٍ مع خطوط واضحة (Outfit و Readex Pro) ودعم كامل للتنقل بلوحة المفاتيح وتقليل الحركة.',
        'أبلغ عن أي مشكلة في القراءة أو التباين عبر مركز المساعدة لنعمل على إصلاحها فوراً.',
      ],
    },
  },
};

interface MarketplaceFooterProps {
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  onOpenSupportChat: (role?: 'customer' | 'seller') => void;
  onNavigateView?: (view: 'physical_stores' | 'online_sellers' | 'catalog') => void;
  compact?: boolean;
  variant?: 'full' | 'compact';
  canExportZip?: boolean;
  onDownloadZip?: () => void;
}

export const MarketplaceFooter: React.FC<MarketplaceFooterProps> = ({
  lang,
  onChangeLang,
  onOpenSupportChat,
  onNavigateView,
  compact = false,
  variant,
  canExportZip = false,
  onDownloadZip,
}) => {
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const isAr = lang === 'ar';
  const isCompact = Boolean(compact || variant === 'compact');
  const activeTopic = activeTopicId ? FOOTER_TOPICS[activeTopicId] || null : null;
  const activeTopicCopy = activeTopic ? (isAr ? activeTopic.ar : activeTopic.en) : null;

  const linkClass =
    'block text-start text-[12.5px] leading-relaxed text-[#5E5C70] transition-colors duration-150 hover:text-[#4A3894] hover:underline dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer';

  return (
    <>
      <footer
        dir={isAr ? 'rtl' : 'ltr'}
        aria-label={isAr ? 'معلومات الموقع وروابط الدعم' : 'Site information and support links'}
        className={`mt-10 border border-[#E4DCF7] bg-white/95 text-[#1E1438] shadow-xs dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#F4F1FC] ${
          isCompact
            ? 'rounded-2xl px-4 py-5 sm:px-6'
            : 'rounded-3xl px-6 py-8 sm:px-10 sm:py-10'
        }`}
      >
        {!isCompact && (
          <div className="mb-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Column 1: About */}
            <div className="space-y-2.5">
              <h3 className="text-[13px] font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'حول ماركتلي' : 'About Marketly'}
              </h3>
              <ul className="space-y-1.5">
                <li>
                  <button type="button" onClick={() => setActiveTopicId('company_overview')} className={linkClass}>
                    {isAr ? 'نبذة عن المنصة' : 'Company info'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('djelfa_story')} className={linkClass}>
                    {isAr ? 'قصتنا في الجلفة' : 'Our Djelfa story'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('verification_standards')} className={linkClass}>
                    {isAr ? 'معايير التوثيق' : 'Verification standards'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('policies')} className={linkClass}>
                    {isAr ? 'السياسات وقواعد الشراء' : 'Policies & buyer rules'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('privacy_care')} className={linkClass}>
                    {isAr ? 'الخصوصية وحماية البيانات' : 'Privacy & data care'}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2: Help & Contact */}
            <div className="space-y-2.5">
              <h3 className="text-[13px] font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'المساعدة والتواصل' : 'Help & Contact'}
              </h3>
              <ul className="space-y-1.5">
                <li>
                  <button
                    type="button"
                    onClick={() => onOpenSupportChat('customer')}
                    className={linkClass}
                  >
                    {isAr ? 'التواصل مع دعم الزبائن' : 'Contact customer support'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onOpenSupportChat('seller')}
                    className={linkClass}
                  >
                    {isAr ? 'مكتب دعم التجار' : 'Seller support desk'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('cod_protection')} className={linkClass}>
                    {isAr ? 'حماية الدفع عند الاستلام' : 'COD buyer protection'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('returns_warranty')} className={linkClass}>
                    {isAr ? 'دليل الإرجاع والضمان' : 'Returns & warranty guide'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('safe_pickup')} className={linkClass}>
                    {isAr ? 'نصائح الاستلام الآمن' : 'Safe local pickup tips'}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Community */}
            <div className="space-y-2.5">
              <h3 className="text-[13px] font-bold text-[#1E1438] dark:text-white">
                {isAr ? 'المجتمع' : 'Community'}
              </h3>
              <ul className="space-y-1.5">
                {onNavigateView && (
                  <>
                    <li>
                      <button
                        type="button"
                        onClick={() => onNavigateView('physical_stores')}
                        className={linkClass}
                      >
                        {isAr ? 'المتاجر الفعلية في الجلفة' : 'Physical Stores in Djelfa'}
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => onNavigateView('online_sellers')}
                        className={linkClass}
                      >
                        {isAr ? 'صفحات البيع أونلاين' : 'Online Seller Pages'}
                      </button>
                    </li>
                  </>
                )}
                <li>
                  <button type="button" onClick={() => setActiveTopicId('announcements')} className={linkClass}>
                    {isAr ? 'الإعلانات والتحديثات' : 'Announcements'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('buyers_community')} className={linkClass}>
                    {isAr ? 'مجتمع متسوقي الجلفة' : 'Djelfa buyers community'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('pc_build_tips')} className={linkClass}>
                    {isAr ? 'نصائح تجميع الحاسوب' : 'PC build & compatibility tips'}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveTopicId('partner_updates')} className={linkClass}>
                    {isAr ? 'تحديثات التجار والشركاء' : 'Partner & seller updates'}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Stay Connected & Region */}
            <div className="space-y-5">
              <div className="space-y-2.5">
                <h3 className="text-[13px] font-bold text-[#1E1438] dark:text-white">
                  {isAr ? 'تواصل معنا' : 'Stay connected'}
                </h3>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="https://facebook.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-[12.5px] text-[#5E5C70] transition-colors duration-150 hover:text-[#4A3894] hover:underline dark:text-[#B9B0D8] dark:hover:text-white"
                    >
                      <Facebook className="h-4 w-4 text-[#9678CE]" />
                      <span>Facebook</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://instagram.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-[12.5px] text-[#5E5C70] transition-colors duration-150 hover:text-[#4A3894] hover:underline dark:text-[#B9B0D8] dark:hover:text-white"
                    >
                      <Instagram className="h-4 w-4 text-[#E794C9]" />
                      <span>Instagram</span>
                    </a>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenSupportChat('customer')}
                      className="inline-flex items-center gap-2 text-[12.5px] text-[#5E5C70] transition-colors duration-150 hover:text-[#4A3894] hover:underline dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer"
                    >
                      <MessageCircle className="h-4 w-4 text-[#4A3894] dark:text-[#9678CE]" />
                      <span>{isAr ? 'محادثة الدعم المباشرة' : 'Live Support Chat'}</span>
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="text-[13px] font-bold text-[#1E1438] dark:text-white">
                  {isAr ? 'منطقة ولغة ماركتلي' : 'Marketly Site'}
                </h3>
                <div className="relative inline-flex items-center">
                  <Globe className="pointer-events-none absolute start-3 h-3.5 w-3.5 text-[#9678CE]" />
                  <select
                    aria-label={isAr ? 'اختر اللغة من التذييل' : 'Footer language selector'}
                    value={lang}
                    onChange={(e) => onChangeLang(e.target.value as LanguageCode)}
                    className="rounded-lg border border-[#E4DCF7] bg-[#FBF9FE] py-2 ps-8 pe-8 text-xs font-medium text-[#1E1438] transition focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                  >
                    <option value="en">Djelfa · English</option>
                    <option value="ar">الجلفة · العربية</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Copyright & Quiet Legal Row */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-[#5E5C70] dark:text-[#B9B0D8] ${
            isCompact ? '' : 'border-t border-[#E4DCF7] pt-5 dark:border-[#22222C]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {isAr
                ? 'جميع الحقوق محفوظة © 2026 ماركتلي الجلفة.'
                : 'Copyright © 2026 Marketly Djelfa. All Rights Reserved.'}
            </span>
            <span>·</span>
            <button
              type="button"
              onClick={() => setActiveTopicId('company_overview')}
              className="hover:text-[#4A3894] hover:underline dark:hover:text-white cursor-pointer"
            >
              {isAr ? 'حول ماركتلي' : 'About'}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setActiveTopicId('accessibility')}
              className="hover:text-[#4A3894] hover:underline dark:hover:text-white cursor-pointer"
            >
              {isAr ? 'سهولة الوصول' : 'Accessibility'}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setActiveTopicId('terms')}
              className="hover:text-[#4A3894] hover:underline dark:hover:text-white cursor-pointer"
            >
              {isAr ? 'شروط الاستخدام' : 'Terms of Use'}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setActiveTopicId('privacy_care')}
              className="hover:text-[#4A3894] hover:underline dark:hover:text-white cursor-pointer"
            >
              {isAr ? 'الخصوصية' : 'Privacy'}
            </button>
            {isCompact && onNavigateView && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => onNavigateView('physical_stores')}
                  className="hover:text-[#4A3894] hover:underline dark:hover:text-white cursor-pointer"
                >
                  {isAr ? 'المتاجر الفعلية' : 'Physical Stores'}
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => onNavigateView('online_sellers')}
                  className="hover:text-[#4A3894] hover:underline dark:hover:text-white cursor-pointer"
                >
                  {isAr ? 'صفحات أونلاين' : 'Online Pages'}
                </button>
              </>
            )}
            {canExportZip && onDownloadZip && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={onDownloadZip}
                  className="inline-flex items-center gap-1 font-semibold text-[#4A3894] hover:underline dark:text-[#E794C9] cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>{isAr ? 'تصدير المشروع (.zip)' : 'Developer Export (.zip)'}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isCompact && (
              <div className="relative inline-flex items-center">
                <Globe className="pointer-events-none absolute start-2.5 h-3 w-3 text-[#9678CE]" />
                <select
                  aria-label={isAr ? 'اختر اللغة من التذييل' : 'Footer language selector'}
                  value={lang}
                  onChange={(e) => onChangeLang(e.target.value as LanguageCode)}
                  className="rounded-lg border border-[#E4DCF7] bg-[#FBF9FE] py-1 ps-7 pe-6 text-[11px] font-medium text-[#1E1438] transition focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C] dark:text-white cursor-pointer"
                >
                  <option value="en">Djelfa · English</option>
                  <option value="ar">الجلفة · العربية</option>
                </select>
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#4A3894] dark:text-[#C5B2EA]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#9678CE]" />
              <span>
                {isAr ? 'سوق التقنية الموثوق في الجلفة' : 'Verified Djelfa Tech Marketplace'}
              </span>
            </span>
          </div>
        </div>
      </footer>

      {/* Marketplace Info Modal for Footer Links */}
      {activeTopic && activeTopicCopy && (
        <div
          dir={isAr ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setActiveTopicId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="footer-topic-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-[#E4DCF7] bg-white p-6 shadow-2xl dark:border-[#22222C] dark:bg-[#0E0E13] modal-enter"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#9678CE]">
                  {activeTopicCopy.section}
                </div>
                <h2
                  id="footer-topic-title"
                  className="font-display mt-1 text-xl font-bold text-[#1E1438] dark:text-white"
                >
                  {activeTopicCopy.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTopicId(null)}
                aria-label={isAr ? 'إغلاق النافذة' : 'Close topic modal'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E4DCF7] text-[#5E5C70] hover:text-[#4A3894] dark:border-[#22222C] dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#5E5C70] dark:text-[#C5B2EA]">
              {activeTopicCopy.summary}
            </p>

            <ul className="mt-4 space-y-2.5 rounded-2xl border border-[#E4DCF7] bg-[#FBF9FE] p-4 dark:border-[#22222C] dark:bg-[#15151C]/90">
              {activeTopicCopy.bullets.map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-xs leading-relaxed text-[#1E1438] dark:text-[#EDE8FA]"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4A3894] dark:text-[#9678CE]" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveTopicId(null)}
                className="rounded-full border border-[#E4DCF7] px-4 py-2 text-xs font-semibold text-[#5E5C70] hover:text-[#4A3894] dark:border-[#22222C] dark:text-[#B9B0D8] dark:hover:text-white cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const role = activeTopic.recommendedRole;
                  setActiveTopicId(null);
                  onOpenSupportChat(role);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#3A2B78] cursor-pointer"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>{isAr ? 'تحدث مع الدعم' : 'Chat with Support'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
