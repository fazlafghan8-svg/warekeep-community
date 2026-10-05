// Trilingual (Dari / Iranian Farsi / English) expense-category icon dictionary.
// Icon names MUST exist in lucide-react (kebab-case, verified by unit test
// against the lucide registry). Per matching rules, spelling variants within
// Damerau-Levenshtein distance <= 2 of a listed keyword are intentionally NOT
// listed — the phonetic and fuzzy layers resolve those at runtime.
export const ICON_COLOR_PALETTE = [
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
    'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate'
] as const;
export type CategoryIconColor = (typeof ICON_COLOR_PALETTE)[number];
export type IconTheme = 'financial' | 'construction' | 'transport' | 'food' | 'office' | 'misc';
export interface IconDictionaryEntry {
    icon: string;
    color: CategoryIconColor;
    theme: IconTheme;
    fa: string[];
    en: string[];
}
export const ICON_DICTIONARY: IconDictionaryEntry[] = [
    // ===== هسته پایه (ترتیب این گروه‌ها در حل تساوی اهمیت دارد — تغییر ندهید) =====
    { icon: 'zap', color: 'amber', theme: 'construction', fa: ['برق', 'بل برق', 'الکتریسیته', 'جنراتور', 'جنریتر', 'سولر'], en: ['electricity', 'power', 'generator', 'solar'] },
    { icon: 'droplets', color: 'blue', theme: 'construction', fa: ['آب', 'بل آب', 'آبرسانی'], en: ['water'] },
    { icon: 'flame', color: 'orange', theme: 'construction', fa: ['گاز', 'سلندر گاز', 'گاز مایع'], en: ['gas'] },
    { icon: 'house', color: 'violet', theme: 'financial', fa: ['کرایه', 'اجاره', 'کرایه دکان', 'کرایه دفتر'], en: ['rent', 'lease'] },
    { icon: 'wallet', color: 'green', theme: 'financial', fa: ['معاش', 'معاشات', 'حقوق', 'دستمزد', 'مزد', 'تنخواه'], en: ['salary', 'wages', 'payroll'] },
    { icon: 'truck', color: 'sky', theme: 'transport', fa: ['حمل و نقل', 'حمل', 'ترانسپورت', 'انتقالات', 'بارچالانی', 'باربری'], en: ['transport', 'shipping', 'delivery', 'freight'] },
    { icon: 'fuel', color: 'orange', theme: 'transport', fa: ['تیل', 'پترول', 'بنزین', 'دیزل', 'گازوئیل', 'سوخت'], en: ['fuel', 'petrol', 'diesel', 'gasoline'] },
    { icon: 'car', color: 'indigo', theme: 'transport', fa: ['موتر', 'ماشین', 'خودرو', 'وسایط نقلیه', 'تکسی'], en: ['car', 'vehicle', 'taxi'] },
    { icon: 'utensils', color: 'red', theme: 'food', fa: ['غذا', 'نان', 'خوراکه', 'طعام', 'اعاشه', 'ناشتا'], en: ['food', 'meal', 'lunch'] },
    { icon: 'coffee', color: 'amber', theme: 'food', fa: ['چای', 'قهوه', 'مهمانداری', 'پذیرایی', 'ضیافت'], en: ['tea', 'coffee', 'hospitality'] },
    { icon: 'wifi', color: 'cyan', theme: 'office', fa: ['انترنت', 'اینترنت', 'وای فای', 'نت'], en: ['internet', 'wifi'] },
    { icon: 'smartphone', color: 'teal', theme: 'office', fa: ['تیلفون', 'تلفن', 'موبایل', 'مبایل', 'کریدت کارت', 'کارت مبایل'], en: ['phone', 'mobile', 'credit'] },
    { icon: 'wrench', color: 'slate', theme: 'construction', fa: ['ترمیم', 'ترمیمات', 'تعمیرات', 'مرمت', 'بازسازی'], en: ['repair', 'maintenance'] },
    { icon: 'receipt', color: 'rose', theme: 'financial', fa: ['مالیه', 'مالیات', 'تکس', 'محصول', 'گمرک', 'عوارض'], en: ['tax', 'customs', 'duty'] },
    { icon: 'pencil', color: 'blue', theme: 'office', fa: ['قرطاسیه', 'لوازم التحریر', 'قلم', 'کاغذ'], en: ['stationery'] },
    { icon: 'printer', color: 'slate', theme: 'office', fa: ['چاپ', 'پرنت', 'فوتوکاپی', 'کاپی'], en: ['print', 'photocopy'] },
    { icon: 'megaphone', color: 'fuchsia', theme: 'office', fa: ['تبلیغات', 'اعلانات', 'اشتهار', 'بازاریابی', 'مارکیتینگ'], en: ['marketing', 'advertising', 'ads'] },
    { icon: 'pill', color: 'red', theme: 'misc', fa: ['دوا', 'دارو', 'ادویه', 'صحت', 'صحی', 'طبی', 'داکتر', 'دکتر', 'کلینیک', 'شفاخانه'], en: ['medicine', 'medical', 'health', 'pharmacy'] },
    { icon: 'spray-can', color: 'teal', theme: 'office', fa: ['صفایی', 'نظافت', 'پاکی', 'پاک کاری', 'شستشو'], en: ['cleaning'] },
    { icon: 'shield', color: 'blue', theme: 'office', fa: ['امنیت', 'محافظ', 'گارد', 'نگهبان', 'سکیورتی'], en: ['security', 'guard'] },
    { icon: 'shield-check', color: 'emerald', theme: 'financial', fa: ['بیمه'], en: ['insurance'] },
    { icon: 'landmark', color: 'indigo', theme: 'financial', fa: ['بانک', 'کمیشن بانک', 'حواله', 'صرافی', 'انتقال پول'], en: ['bank', 'transfer', 'commission', 'exchange'] },
    { icon: 'plane', color: 'sky', theme: 'transport', fa: ['سفر', 'مسافرت', 'تکت', 'بلیط', 'طیاره', 'هواپیما'], en: ['travel', 'flight', 'ticket'] },
    { icon: 'building-2', color: 'purple', theme: 'construction', fa: ['هوتل', 'هتل', 'اقامت'], en: ['hotel', 'accommodation'] },
    { icon: 'hammer', color: 'amber', theme: 'construction', fa: ['ابزار', 'تجهیزات', 'ماشین آلات', 'سامان آلات', 'وسایل'], en: ['tools', 'equipment', 'machinery'] },
    { icon: 'shirt', color: 'purple', theme: 'misc', fa: ['لباس', 'یونیفورم', 'پوشاک', 'دریشی'], en: ['clothing', 'uniform'] },
    { icon: 'graduation-cap', color: 'blue', theme: 'office', fa: ['آموزش', 'تعلیم', 'کورس', 'تریننگ', 'سیمینار', 'ورکشاپ'], en: ['training', 'education', 'course', 'seminar'] },
    { icon: 'stamp', color: 'slate', theme: 'office', fa: ['جواز', 'لایسنس', 'ثبت', 'راجستر'], en: ['license', 'registration', 'permit'] },
    { icon: 'monitor', color: 'violet', theme: 'office', fa: ['نرم افزار', 'سافت ویر', 'اشتراک', 'سبسکریپشن', 'اپلیکیشن'], en: ['software', 'subscription', 'app'] },
    { icon: 'laptop', color: 'indigo', theme: 'office', fa: ['کمپیوتر', 'رایانه', 'لپتاپ', 'آی تی'], en: ['computer', 'laptop', 'it'] },
    { icon: 'user', color: 'pink', theme: 'financial', fa: ['شخصی', 'برداشت شخصی', 'برداشت'], en: ['personal'] },
    { icon: 'heart-handshake', color: 'rose', theme: 'misc', fa: ['خیرات', 'صدقه', 'زکات', 'اعانه', 'کمک'], en: ['charity', 'donation'] },
    { icon: 'boxes', color: 'amber', theme: 'misc', fa: ['مواد خام', 'مواد اولیه', 'مواد'], en: ['raw materials'] },
    { icon: 'warehouse', color: 'yellow', theme: 'construction', fa: ['گدام', 'انبار', 'ذخیره'], en: ['warehouse', 'storage'] },
    { icon: 'shopping-cart', color: 'green', theme: 'financial', fa: ['خرید', 'خریداری', 'اجناس'], en: ['purchase', 'procurement'] },
    { icon: 'package', color: 'orange', theme: 'transport', fa: ['پست', 'پسته', 'کوریر', 'پارسل', 'ارسال'], en: ['post', 'courier', 'parcel'] },
    { icon: 'palette', color: 'fuchsia', theme: 'office', fa: ['دیزاین', 'طراحی', 'گرافیک', 'عکاسی', 'فوتو'], en: ['design', 'photo', 'graphics'] },
    { icon: 'scale', color: 'slate', theme: 'office', fa: ['وکیل', 'حقوقی', 'مشاوره', 'مشورت', 'حق الزحمه'], en: ['legal', 'lawyer', 'consulting'] },
    { icon: 'hand-coins', color: 'yellow', theme: 'financial', fa: ['قرض', 'قرضه', 'وام'], en: ['loan', 'debt'] },
    { icon: 'gavel', color: 'red', theme: 'financial', fa: ['جریمه'], en: ['fine', 'penalty'] },
    { icon: 'tag', color: 'slate', theme: 'misc', fa: ['متفرقه', 'سایر', 'دیگر', 'عمومی'], en: ['misc', 'other', 'general'] },
    // ===== گسترش: دکان‌داری و تجارت =====
    { icon: 'store', color: 'orange', theme: 'financial', fa: ['دکان', 'مغازه', 'فروشگاه', 'مارکیت', 'بازار'], en: ['shop', 'store', 'market'] },
    { icon: 'banknote', color: 'green', theme: 'financial', fa: ['پول نقد', 'نقده', 'روزمره'], en: ['cash', 'petty cash'] },
    { icon: 'credit-card', color: 'indigo', theme: 'financial', fa: ['پرداخت', 'کارت بانکی', 'پی او اس'], en: ['payment', 'card', 'pos'] },
    { icon: 'percent', color: 'rose', theme: 'financial', fa: ['تخفیف', 'رعایت'], en: ['discount'] },
    { icon: 'trending-down', color: 'red', theme: 'financial', fa: ['ضرر', 'زیان', 'کسرات'], en: ['loss', 'shrinkage'] },
    { icon: 'piggy-bank', color: 'pink', theme: 'financial', fa: ['پس انداز', 'اندوخته'], en: ['savings'] },
    { icon: 'calendar', color: 'rose', theme: 'financial', fa: ['قسط', 'اقساط', 'ماهوار', 'ماهانه'], en: ['installment', 'monthly'] },
    { icon: 'container', color: 'blue', theme: 'transport', fa: ['کانتینر', 'بار', 'محموله'], en: ['container', 'cargo'] },
    { icon: 'gem', color: 'fuchsia', theme: 'misc', fa: ['زیورات', 'طلا', 'جواهرات', 'نقره'], en: ['jewelry', 'gold'] },
    { icon: 'handshake', color: 'emerald', theme: 'financial', fa: ['شراکت', 'همکاری', 'دلالی'], en: ['partnership', 'brokerage'] },
    // ===== گسترش: تولیدی و صنعتی =====
    { icon: 'factory', color: 'slate', theme: 'construction', fa: ['فابریکه', 'کارخانه', 'تولیدی', 'فبریکه'], en: ['factory', 'manufacturing', 'production'] },
    { icon: 'cog', color: 'slate', theme: 'construction', fa: ['پرزه', 'پرزه جات', 'قطعات', 'اسپیر پارت'], en: ['spare parts', 'parts'] },
    { icon: 'flask-conical', color: 'purple', theme: 'misc', fa: ['لابراتوار', 'آزمایش', 'کیمیاوی'], en: ['laboratory', 'testing', 'chemicals'] },
    { icon: 'forklift', color: 'yellow', theme: 'transport', fa: ['لفتراک', 'بارگیری', 'تخلیه'], en: ['forklift', 'loading'] },
    { icon: 'battery-charging', color: 'lime', theme: 'construction', fa: ['بطری', 'باطری', 'چارجر'], en: ['battery', 'charger'] },
    { icon: 'cable', color: 'slate', theme: 'construction', fa: ['کیبل', 'سیم', 'وایرنگ'], en: ['cable', 'wiring'] },
    // ===== گسترش: ساختمانی =====
    { icon: 'brick-wall', color: 'orange', theme: 'construction', fa: ['سمنت', 'سمینت', 'خشت', 'سنگ', 'ریگ', 'جغل'], en: ['cement', 'bricks', 'gravel'] },
    { icon: 'hard-hat', color: 'amber', theme: 'construction', fa: ['ساختمانی', 'اعمار', 'آبادی', 'انجنیری'], en: ['construction', 'engineering'] },
    { icon: 'paint-roller', color: 'lime', theme: 'construction', fa: ['رنگمالی', 'رنگ', 'نقاشی ساختمان'], en: ['painting', 'paint'] },
    { icon: 'ruler', color: 'amber', theme: 'construction', fa: ['نقشه کشی', 'سروی', 'اندازه گیری'], en: ['survey', 'measurement'] },
    { icon: 'fence', color: 'slate', theme: 'construction', fa: ['حصار', 'دیوار', 'جالی'], en: ['fence', 'wall'] },
    { icon: 'drill', color: 'slate', theme: 'construction', fa: ['برمه', 'ولدنگ', 'نجاری'], en: ['drilling', 'welding', 'carpentry'] },
    // ===== گسترش: دفتری و خدماتی =====
    { icon: 'briefcase', color: 'slate', theme: 'office', fa: ['دفتر', 'دفترداری', 'اداری', 'مصارف دفتر'], en: ['office', 'administrative'] },
    { icon: 'file-text', color: 'blue', theme: 'office', fa: ['اسناد', 'مدارک', 'قرارداد', 'فورم', 'عریضه'], en: ['documents', 'contract', 'forms'] },
    { icon: 'mail', color: 'sky', theme: 'office', fa: ['مکتوب', 'نامه', 'ایمیل'], en: ['mail', 'email'] },
    { icon: 'users', color: 'blue', theme: 'office', fa: ['کارمندان', 'کارگر', 'پرسونل', 'کارکنان', 'مزدور', 'اجیر'], en: ['staff', 'workers', 'employees', 'labor'] },
    { icon: 'clock', color: 'slate', theme: 'office', fa: ['اضافه کاری', 'ساعتی', 'اوورتایم'], en: ['overtime', 'hourly'] },
    { icon: 'server', color: 'violet', theme: 'office', fa: ['سرور', 'هاستنگ', 'هاست', 'دیتابیس'], en: ['server', 'hosting', 'database'] },
    { icon: 'globe', color: 'cyan', theme: 'office', fa: ['ویب سایت', 'وبسایت', 'سایت', 'دامنه', 'دامین'], en: ['website', 'domain', 'web'] },
    { icon: 'camera', color: 'violet', theme: 'office', fa: ['کمره', 'دوربین', 'ویدیو', 'فلمبرداری'], en: ['camera', 'video'] },
    { icon: 'newspaper', color: 'slate', theme: 'office', fa: ['اخبار', 'روزنامه', 'مجله', 'نشریه'], en: ['newspaper', 'magazine', 'press'] },
    { icon: 'award', color: 'yellow', theme: 'office', fa: ['جایزه', 'تقدیرنامه', 'مکافات'], en: ['award', 'prize', 'bonus'] },
    { icon: 'presentation', color: 'indigo', theme: 'office', fa: ['کنفرانس', 'جلسه', 'میتنگ', 'نمایشگاه'], en: ['conference', 'meeting', 'exhibition'] },
    { icon: 'scissors', color: 'teal', theme: 'misc', fa: ['خیاطی', 'دوزندگی', 'سلمانی', 'آرایشگاه'], en: ['tailoring', 'barber', 'salon'] },
    { icon: 'key', color: 'amber', theme: 'construction', fa: ['قفل', 'کلید', 'قلف'], en: ['keys', 'locks'] },
    { icon: 'trash-2', color: 'red', theme: 'misc', fa: ['کثافات', 'زباله', 'فاضلاب', 'کثافت کشی'], en: ['garbage', 'waste', 'sewage'] },
    { icon: 'recycle', color: 'green', theme: 'misc', fa: ['بازیافت'], en: ['recycling'] },
    // ===== گسترش: ترانسپورت تکمیلی =====
    { icon: 'bus', color: 'yellow', theme: 'transport', fa: ['بس', 'ملی بس', 'کرایه راه'], en: ['bus', 'fare'] },
    { icon: 'bike', color: 'lime', theme: 'transport', fa: ['بایسکل', 'دوچرخه', 'موترسایکل', 'موتورسیکلت'], en: ['bicycle', 'motorbike'] },
    { icon: 'ship', color: 'blue', theme: 'transport', fa: ['کشتی', 'بندر', 'بحری'], en: ['ship', 'port', 'sea freight'] },
    { icon: 'train-front', color: 'slate', theme: 'transport', fa: ['ریل', 'قطار'], en: ['train', 'rail'] },
    { icon: 'luggage', color: 'purple', theme: 'transport', fa: ['بکس سفری', 'سامان سفر'], en: ['luggage', 'baggage'] },
    // ===== گسترش: خوراکه و زراعت =====
    { icon: 'wheat', color: 'amber', theme: 'food', fa: ['گندم', 'آرد', 'غله', 'زراعت', 'کشاورزی'], en: ['wheat', 'flour', 'agriculture', 'farming'] },
    { icon: 'beef', color: 'red', theme: 'food', fa: ['گوشت', 'قصابی'], en: ['meat', 'butcher'] },
    { icon: 'milk', color: 'sky', theme: 'food', fa: ['شیر', 'لبنیات', 'ماست', 'پنیر'], en: ['milk', 'dairy'] },
    { icon: 'apple', color: 'red', theme: 'food', fa: ['میوه', 'ترکاری', 'سبزیجات', 'سبزی'], en: ['fruit', 'vegetables'] },
    { icon: 'candy', color: 'pink', theme: 'food', fa: ['شیرینی', 'بوره', 'شکر', 'قنادی'], en: ['sugar', 'sweets', 'confectionery'] },
    { icon: 'fish', color: 'cyan', theme: 'food', fa: ['ماهی', 'مرغ', 'تخم مرغ'], en: ['fish', 'chicken', 'eggs'] },
    { icon: 'chef-hat', color: 'amber', theme: 'food', fa: ['رستورانت', 'رستوران', 'آشپزخانه', 'آشپز', 'قابلی'], en: ['restaurant', 'kitchen', 'catering'] },
    { icon: 'refrigerator', color: 'sky', theme: 'food', fa: ['یخچال', 'فریزر', 'سردخانه'], en: ['refrigerator', 'freezer', 'cold storage'] },
    { icon: 'paw-print', color: 'amber', theme: 'food', fa: ['مواشی', 'مرغداری', 'دامداری', 'حیوانات', 'علوفه'], en: ['livestock', 'poultry', 'animals', 'fodder'] },
    { icon: 'trees', color: 'green', theme: 'food', fa: ['باغبانی', 'باغ', 'گل', 'نهال', 'درخت'], en: ['gardening', 'plants', 'flowers'] },
    { icon: 'tractor', color: 'green', theme: 'food', fa: ['تراکتور', 'قلبه', 'کشت'], en: ['tractor', 'plowing'] },
    // ===== گسترش: تاسیسات و لوازم =====
    { icon: 'lightbulb', color: 'yellow', theme: 'construction', fa: ['گروپ', 'چراغ', 'روشنایی'], en: ['lighting', 'bulb'] },
    { icon: 'fan', color: 'cyan', theme: 'construction', fa: ['پکه', 'بادپکه'], en: ['fan'] },
    { icon: 'air-vent', color: 'sky', theme: 'construction', fa: ['ایرکندیشن', 'کولر', 'تهویه'], en: ['air conditioning', 'cooling'] },
    { icon: 'thermometer', color: 'orange', theme: 'construction', fa: ['بخاری', 'گرمایش', 'مرکزگرمی', 'ذغال', 'چوب سوخت'], en: ['heating', 'heater', 'coal', 'firewood'] },
    { icon: 'armchair', color: 'amber', theme: 'construction', fa: ['فرنیچر', 'مبل', 'میز', 'چوکی', 'الماری', 'قالین'], en: ['furniture', 'carpet'] },
    { icon: 'washing-machine', color: 'teal', theme: 'misc', fa: ['لاندری', 'خشکشویی', 'کالاشویی'], en: ['laundry'] },
    { icon: 'snowflake', color: 'cyan', theme: 'misc', fa: ['یخ', 'برفپاکی', 'برف'], en: ['ice', 'snow removal'] },
    // ===== گسترش: مصارف شخصی و اجتماعی =====
    { icon: 'book-open', color: 'blue', theme: 'office', fa: ['کتاب', 'مکتب', 'مدرسه', 'پوهنتون', 'دانشگاه', 'فیس'], en: ['school', 'university', 'books', 'tuition'] },
    { icon: 'baby', color: 'pink', theme: 'misc', fa: ['اطفال', 'کودک', 'طفل', 'شیرخوار'], en: ['baby', 'children', 'kids'] },
    { icon: 'gift', color: 'pink', theme: 'misc', fa: ['تحفه', 'هدیه', 'بخشش'], en: ['gift', 'present'] },
    { icon: 'party-popper', color: 'fuchsia', theme: 'misc', fa: ['محفل', 'جشن', 'مراسم', 'عروسی', 'خوشی', 'نامزدی'], en: ['party', 'event', 'wedding', 'celebration'] },
    { icon: 'moon-star', color: 'emerald', theme: 'misc', fa: ['مسجد', 'نماز', 'رمضان', 'عید', 'قربانی', 'خمس'], en: ['mosque', 'eid', 'ramadan', 'religious'] },
    { icon: 'dumbbell', color: 'emerald', theme: 'misc', fa: ['ورزش', 'جیم', 'سپورت', 'فتنس'], en: ['gym', 'sports', 'fitness'] },
    { icon: 'gamepad-2', color: 'violet', theme: 'misc', fa: ['بازی', 'سرگرمی', 'تفریح'], en: ['games', 'entertainment', 'recreation'] },
    { icon: 'tv', color: 'indigo', theme: 'misc', fa: ['تلویزیون', 'تی وی'], en: ['tv', 'television'] },
    { icon: 'music', color: 'purple', theme: 'misc', fa: ['موسیقی', 'ساز', 'آهنگ'], en: ['music'] },
    { icon: 'glasses', color: 'slate', theme: 'misc', fa: ['عینک', 'چشم'], en: ['glasses', 'optics'] },
    { icon: 'bed', color: 'violet', theme: 'misc', fa: ['خوابگاه', 'لیلیه', 'بستره'], en: ['dormitory', 'bedding'] },
    { icon: 'film', color: 'rose', theme: 'misc', fa: ['سینما', 'فلم'], en: ['cinema', 'movie'] },
];
/** Unique, ordered list of every icon name used by the dictionary.
 *  Doubles as the whitelist for AI suggestions and the Icon Picker catalog. */
export const ALL_CATEGORY_ICONS: string[] = Array.from(new Set(ICON_DICTIONARY.map((entry) => entry.icon)));
const CATEGORY_ICON_SET = new Set(ALL_CATEGORY_ICONS);
const COLOR_SET = new Set<string>(ICON_COLOR_PALETTE);
export const isKnownCategoryIcon = (icon: unknown): icon is string => typeof icon === 'string' && CATEGORY_ICON_SET.has(icon);
export const isCategoryIconColor = (color: unknown): color is CategoryIconColor => typeof color === 'string' && COLOR_SET.has(color);
