export type SpecialistMode = 'general' | 'psychology' | 'marketing' | 'egypt_shops';

export interface GroundingSourceItem {
  title: string;
  uri: string;
  kind: 'web' | 'maps';
}

export interface EgyptShopResult {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  phone: string | null;
  googleMapsUri: string;
  primaryType?: string;
}

export interface KnowledgeStudyCard {
  id: string;
  domain: 'psychology' | 'marketing';
  titleAr: string;
  titleEn: string;
  researcher: string;
  year: string;
  summaryAr: string;
  practicalTakeawayAr: string;
  keywords: string[];
}

export const SPECIALIST_MODE_OPTIONS: Array<{
  id: SpecialistMode;
  label: string;
  shortLabel: string;
  description: string;
  samplePrompts: string[];
}> = [
  {
    id: 'general',
    label: 'المساعد العام',
    shortLabel: 'عام',
    description: 'مساعدك الشخصي بالمصري للمهام والتذكيرات وتنظيم اليوم والبحث الذكي',
    samplePrompts: [
      'اشرحلي بالمصري نظرية الإقناع لروبرت تشالديني وإزاي أطبقها في البيع',
      'فين أحسن محلات عطور أصلية في المعادي أو التجمع؟',
      'فكّرني كل يوم الساعة ٨ الصبح أراجع خطة يومي',
      'إيه أحدث دراسات علم النفس عن التسويف وإزاي أتغلب عليه؟',
    ],
  },
  {
    id: 'psychology',
    label: 'علم النفس والدراسات',
    shortLabel: 'علم نفس',
    description: 'دراسات نفسية موثقة من النت + تحليل سلوكي وعلمي مبسط بالمصري',
    samplePrompts: [
      'اشرحلي نظرية النظام الأول والتاني لدانيال كانيمان بأمثلة من حياتنا',
      'إيه التنافر المعرفي (Cognitive Dissonance) وإزاي بيأثر على قراراتنا؟',
      'هاتلي دراسات نفسية حديثة عن تكوين العادات والتخلص من التشتت',
      'إزاي نظرية تقرير المصير (Self-Determination) بتفسر الشغف والتحفيز؟',
    ],
  },
  {
    id: 'marketing',
    label: 'التسويق وسلوك المستهلك',
    shortLabel: 'تسويق',
    description: 'استراتيجيات تسويق حديثة من النت + علم نفس التسعير والإقناع للسوق المصري',
    samplePrompts: [
      'إزاي أستخدم تأثير الطُعم (Decoy Effect) ونفسية التسعير عشان أزود المبيعات؟',
      'اعمل لي خطة تسويق بالمحتوى لبراند في مصر تعتمد على علم نفس المستهلك',
      'إيه أحدث ترندات التسويق الرقمي في مصر ٢٠٢٦ من النت؟',
      'اشرحلي إطار Jobs To Be Done وإزاي أكتب إعلان يقنع العميل المصري',
    ],
  },
  {
    id: 'egypt_shops',
    label: 'محلات وأماكن في مصر',
    shortLabel: 'محلات مصر',
    description: 'بحث حقيقي ومباشر على خرائط جوجل لأماكن وتقييمات وعناوين المحلات في مصر',
    samplePrompts: [
      'أحسن محلات لابتوب وإلكترونيات في وسط البلد أو مدينة نصر',
      'محلات ملابس رجالي شيك في المعادي أو الزمالك',
      'أشهر محلات القهوة المختصة في التجمع الخامس',
      'محلات أجهزة منزلية وموبايلات مضمونة في الشيخ زايد',
    ],
  },
];

export const EGYPT_AREA_CHIPS = [
  'القاهرة',
  'المعادي',
  'مدينة نصر',
  'التجمع الخامس',
  'الشيخ زايد',
  '6 أكتوبر',
  'وسط البلد',
  'الزمالك',
  'المهندسين',
  'مصر الجديدة',
  'الإسكندرية',
  'المنصورة',
];

export const PSYCHOLOGY_MARKETING_STUDIES: KnowledgeStudyCard[] = [
  {
    id: 'kahneman-dual-process',
    domain: 'psychology',
    titleAr: 'التفكير السريع والبطيء (النظام ١ والنظام ٢)',
    titleEn: 'Dual-Process Theory (System 1 & System 2)',
    researcher: 'Daniel Kahneman & Amos Tversky',
    year: '1979 / 2011',
    summaryAr:
      'العقل البشري بيشتغل بنظامين: النظام ١ سريع وتلقائي وعاطفي وبيحكم أغلب قرارات الشراء اليومية، والنظام ٢ بطيء وتحليلي ومكلف ذهنياً. مع نظرية الاحتمال (Prospect Theory)، ألم الخسارة عند الإنسان أقوى تقريباً مرتين من متعة المكسب بنفس القيمة.',
    practicalTakeawayAr:
      'في التسويق والقرارات: بسّط الرسالة عشان تخاطب النظام ١ بسرعة، ووضح للعميل إيه اللي هيخسره لو فوت العرض مش بس هيكسب إيه.',
    keywords: ['كانيمان', 'تفيرسكي', 'النظام', 'خسارة', 'prospect', 'kahneman', 'bias', 'تحيز', 'قرار'],
  },
  {
    id: 'cialdini-persuasion',
    domain: 'marketing',
    titleAr: 'المبادئ السبعة للإقناع والتأثير',
    titleEn: '7 Principles of Persuasion',
    researcher: 'Robert Cialdini',
    year: '1984 / 2021',
    summaryAr:
      'تشالديني أثبت بالتجارب إن قرارات الناس بتتأثر بـ ٧ محركات أساسية: المعاملة بالمثل (Reciprocity)، الندرة (Scarcity)، السلطة والخبرة (Authority)، الالتزام والاتساق (Consistency)، القبول والمودة (Liking)، الدليل الاجتماعي (Social Proof)، والوحدة والانتماء (Unity).',
    practicalTakeawayAr:
      'في السوق المصري: الدليل الاجتماعي (ريفيوهات حقيقية + تجارب ناس شبه العميل) والمعاملة بالمثل (محتوى مجاني مفيد قبل البيع) بيرفعوا التحويل بشكل ضخم.',
    keywords: ['تشالديني', 'إقناع', 'persuasion', 'cialdini', 'ندرة', 'دليل اجتماعي', 'social proof', 'مبيعات', 'بيع'],
  },
  {
    id: 'fogg-behavior-model',
    domain: 'psychology',
    titleAr: 'نموذج فوج للسلوك والعادات (B = MAP)',
    titleEn: 'Fogg Behavior Model',
    researcher: 'BJ Fogg (Stanford)',
    year: '2009 / 2019',
    summaryAr:
      'أي سلوك بيحصل فقط لما يجتمع ٣ عناصر في نفس اللحظة: الدافع (Motivation) + القدرة والسهولة (Ability) + المحفز (Prompt). كل ما المهمة أو خطوة الشراء كانت أسهل، كل ما احتجت دافع أقل عشان تحصل.',
    practicalTakeawayAr:
      'لبناء عادة جديدة أو زيادة المبيعات: قلل الاحتكاك (Friction) لأقصى درجة بدل ما تعتمد على الحماس المؤقت.',
    keywords: ['عادات', 'عادة', 'سلوك', 'fogg', 'habit', 'تسويف', 'تحفيز', 'احتكاك', 'شراء'],
  },
  {
    id: 'festinger-cognitive-dissonance',
    domain: 'psychology',
    titleAr: 'التنافر المعرفي وتبرير القرارات',
    titleEn: 'Cognitive Dissonance Theory',
    researcher: 'Leon Festinger',
    year: '1957',
    summaryAr:
      'لما بيحصل تعارض بين معتقدات الشخص وتصرفاته (أو بعد ما يشتري حاجة غالية ويشك في قراره)، بيحس بتوتر نفسي ويدور على مبررات تريّحه وتثبت إنه عمل الصح.',
    practicalTakeawayAr:
      'في تجربة ما بعد البيع: ابعت رسالة طمأنة وتأكيد قيمة بعد الشراء فوراً (أو ضمان استرجاع واضح) عشان تقضي على ندم المشتري وتكسب ولاءه.',
    keywords: ['تنافر', 'معرفي', 'dissonance', 'festinger', 'ندم', 'مشتري', 'تبرير', 'ولاء'],
  },
  {
    id: 'ariely-decoy-pricing',
    domain: 'marketing',
    titleAr: 'تأثير الطُعم وسيكولوجية التسعير',
    titleEn: 'Decoy Effect & Predictably Irrational Pricing',
    researcher: 'Dan Ariely & Joel Huber',
    year: '1982 / 2008',
    summaryAr:
      'العميل مبيعرفش يقيّم السعر لوحده؛ دايماً بيقارن. إضافة باقة تالتة «طُعم» (Decoy) قريبة في السعر من الباقة الأعلى لكن قيمتها أقل بتخلي الباقة الأعلى تبان صفقة ذهبية.',
    practicalTakeawayAr:
      'قدّم ٣ باقات سعرية (اقتصادية / الأكثر طلباً / VIP) مع تثبيت السعر المرجعي (Anchoring) عشان توجه الاختيار بذكاء.',
    keywords: ['تسعير', 'سعر', 'طعم', 'decoy', 'anchoring', 'اريلي', 'ariely', 'باقات', 'عروض'],
  },
  {
    id: 'thaler-nudge-mental-accounting',
    domain: 'marketing',
    titleAr: 'المحاسبة الذهنية ونظرية الدفعة (Nudge)',
    titleEn: 'Mental Accounting & Nudge Theory',
    researcher: 'Richard Thaler & Cass Sunstein',
    year: '1985 / 2008',
    summaryAr:
      'الناس بتقسم فلوسها في دماغها لـ «أظرف ذهنية» مختلفة (مصاريف أساسية، ترفيه، هدايا) وبتصرف من كل ظرف بحساسية سعرية مختلفة، وهندسة الاختيار (Choice Architecture) بتوجه القرار بدون إجبار.',
    practicalTakeawayAr:
      'اعرض السعر اليومي أو الشهري بدل الرقم السنوي الكبير، وخلّي الخيار الأنسب هو الافتراضي الواضح.',
    keywords: ['ثالر', 'thaler', 'nudge', 'محاسبة ذهنية', 'تقسيط', 'اقتصاد سلوكي', 'behavioral'],
  },
  {
    id: 'byron-sharp-brands',
    domain: 'marketing',
    titleAr: 'كيف تنمو العلامات التجارية (التوافر الذهني والمادي)',
    titleEn: 'How Brands Grow — Mental & Physical Availability',
    researcher: 'Byron Sharp (Ehrenberg-Bass Institute)',
    year: '2010',
    summaryAr:
      'النمو الحقيقي للبراندات بييجي من الوصول لعدد أكبر من المشترين الخفاف (Light Buyers) عبر «التوافر الذهني» (العميل يفتكرك لحظة الاحتياج) و«التوافر المادي» (يلاقيك بسهولة أونلاين أو في المحلات)، واستخدام أصول مميزة للبراند (Distinctive Brand Assets).',
    practicalTakeawayAr:
      'ثبّت ألوانك وهويتك وأسلوب كلامك في كل إعلان، واربط البراند بمواقف الشراء الحقيقية (Category Entry Points).',
    keywords: ['براند', 'علامة تجارية', 'byron sharp', 'نمو', 'هوية', 'إعلان', 'تسويق'],
  },
  {
    id: 'deci-ryan-sdt',
    domain: 'psychology',
    titleAr: 'نظرية تقرير المصير والدافع الداخلي',
    titleEn: 'Self-Determination Theory (SDT)',
    researcher: 'Edward Deci & Richard Ryan',
    year: '1985 / 2000',
    summaryAr:
      'التحفيز المستمر والصحة النفسية بيقوموا على ٣ احتياجات فطرية: الاستقلالية (Autonomy)، الكفاءة والشعور بالتقدم (Competence)، والانتماء والعلاقات الحقيقية (Relatedness).',
    practicalTakeawayAr:
      'لو حاسس بفقدان شغف أو بتدير فريق: راجع أي احتياج من التلاتة ناقص — الإحساس بالتحكم، أو وضوح التقدم، أو الدعم الاجتماعي.',
    keywords: ['شغف', 'تحفيز', 'دافع', 'اكتئاب', 'إرهاق', 'استقلالية', 'motivation', 'sdt', 'نفسية'],
  },
  {
    id: 'schwartz-paradox-choice',
    domain: 'marketing',
    titleAr: 'مفارقة الاختيار وشلل القرار',
    titleEn: 'The Paradox of Choice (Jam Study)',
    researcher: 'Sheena Iyengar & Barry Schwartz',
    year: '2000 / 2004',
    summaryAr:
      'في تجربة المربى الشهيرة، الكشك اللي عرض ٦ أنواع باع أكتر ١٠ أضعاف الكشك اللي عرض ٢٤ نوع! الاختيارات الكتيرة بترهق العقل وتخلي العميل يأجل القرار أو يندم بعده.',
    practicalTakeawayAr:
      'قلل الخيارات في صفحة الهبوط أو المنيو لـ ٣–٤ اختيارات واضحة مع توصية «الأكثر مبيعاً» عشان ترفع المبيعات.',
    keywords: ['اختيار', 'شلل', 'مربى', 'schwartz', 'iyengar', 'تردد', 'تحويل', 'landing', 'منتجات'],
  },
  {
    id: 'kahneman-peak-end',
    domain: 'psychology',
    titleAr: 'قاعدة الذروة والنهاية وتأثير زيجارنيك',
    titleEn: 'Peak-End Rule & Zeigarnik Effect',
    researcher: 'Daniel Kahneman & Bluma Zeigarnik',
    year: '1927 / 1993',
    summaryAr:
      'الناس بتفتكر أي تجربة بناءً على أقوى لحظة فيها (الذروة) وآخر لحظة فيها (النهاية)، مش المتوسط. وتأثير زيجارنيك بيوضح إن العقل بيفضل منشغل بالمهام أو القصص المفتوحة أكتر من المكتملة.',
    practicalTakeawayAr:
      'في المحتوى والتسويق: افتح «حلقة فضول» في أول ٣ ثواني من الفيديو، واختم تجربة العميل بلحظة مفاجأة لطيفة أو تغليف ممتاز.',
    keywords: ['ذروة', 'نهاية', 'زيجارنيك', 'محتوى', 'ريلز', 'فيديو', 'hook', 'تجربة عميل', 'ذاكرة'],
  },
];

export function detectSpecialistIntent(
  rawText: string,
  explicitMode: SpecialistMode = 'general',
): {
  resolvedMode: SpecialistMode;
  useGoogleSearch: boolean;
  useEgyptShopsLookup: boolean;
} {
  if (explicitMode === 'egypt_shops') {
    return {resolvedMode: 'egypt_shops', useGoogleSearch: false, useEgyptShopsLookup: true};
  }
  if (explicitMode === 'psychology') {
    return {resolvedMode: 'psychology', useGoogleSearch: true, useEgyptShopsLookup: false};
  }
  if (explicitMode === 'marketing') {
    return {resolvedMode: 'marketing', useGoogleSearch: true, useEgyptShopsLookup: false};
  }

  const text = rawText.toLowerCase();

  // Check if user is asking for shops/places in Egypt
  const shopKeywords =
    /(?:محل(?:ات)?|متجر|متاجر|مول(?:ات)?|كافيه(?:ات)?|مطعم|مطاعم|صيدلي[ةه]|مكتب[ةه]|سوبر\s*ماركت|شوب|براندات\s+في|فين\s+ألاقي|فين\s+أشتري|أماكن\s+(?:بيع|شراء|محلات)|عنوان\s+محل|أقرب\s+محل|أحسن\s+محل|\bshop(?:s)?\b|\bstore(?:s)?\b|\bmall\b)/;
  const egyptLocationKeywords =
    /(?:مصر|القاهر[ةه]|الجيز[ةه]|المعادي|مدينة\s*نصر|التجمع|الشيخ\s*زايد|زايد|[٦6]\s*[أا]كتوبر|[أا]كتوبر|الزمالك|وسط\s*البلد|المهندسين|مصر\s*الجديد[ةه]|الرحاب|مدينتي|الدقي|العجوز[ةه]|شبرا|الهرم|فيصل|[إاأ]سكندري[ةه]|المنصور[ةه]|طنطا|الزقازيق|[أا]سيوط|بورسعيد|السويس|[إاأ]سماعيلي[ةه]|الغردق[ةه]|شرم|egypt|cairo|giza|alexandria|maadi|nasr\s*city|zamalek|october|zayed)/;

  if (shopKeywords.test(text) && (egyptLocationKeywords.test(text) || /فين|أقرب|عنوان|أماكن|أحسن\s+محل/.test(text))) {
    return {resolvedMode: 'egypt_shops', useGoogleSearch: false, useEgyptShopsLookup: true};
  }

  // Check if user is asking about marketing & consumer psychology first (since marketing queries often cite psychologists like Cialdini/Kahneman)
  const marketingKeywords =
    /(?:تسويق|ماركتنج|مبيعات|إعلان(?:ات)?|حمل[ةه]\s*إعلاني[ةه]|براند|هوي[ةه]\s*بصري[ةه]|سلوك\s*المستهلك|تسعير|محتوى|ريلز|إقناع|عملاء|تحويل|سوشيال\s*ميديا|سيو|سوق\s*مصري|\bmarketing\b|\bbranding\b|\bcopywriting\b|\bpricing\b|\bfunnel\b|\bconversion\b|\bseo\b)/;
  if (marketingKeywords.test(text)) {
    return {resolvedMode: 'marketing', useGoogleSearch: true, useEgyptShopsLookup: false};
  }

  // Check if user is asking about psychology studies
  const psychKeywords =
    /(?:علم\s*النفس|دراسات\s*نفسي[ةه]|دراس[ةه]\s*نفسي[ةه]|نفسي[ةه]|سيكولوجي|سلوك(?:ي[ةه])?|تحيز\s*معرفي|تنافر\s*معرفي|عادات|تسويف|اكتئاب|قلق|ثق[ةه]\s*بالنفس|لغة\s*الجسد|كانيمان|فرويد|يونج|تشالديني|فوج|دوبامين|\bpsychology\b|\bcognitive\b|\bbehavioral\b|\bstudy\b|\bstudies\b|\btherapy\b)/;
  if (psychKeywords.test(text)) {
    return {resolvedMode: 'psychology', useGoogleSearch: true, useEgyptShopsLookup: false};
  }

  // Also trigger live web search when user explicitly asks to search the internet or asks for latest news/stats
  const webResearchKeywords =
    /(?:من\s*النت|على\s*النت|ابحث\s*(?:لي|في\s*النت|على\s*جوجل)|أحدث\s*(?:دراسات|أبحاث|إحصائيات|ترندات|أخبار)|إحصائيات|مصادر\s*من\s*النت|\bsearch\b|\blatest\b|\btrends\b)/;
  if (webResearchKeywords.test(text)) {
    return {resolvedMode: 'general', useGoogleSearch: true, useEgyptShopsLookup: false};
  }

  return {resolvedMode: 'general', useGoogleSearch: false, useEgyptShopsLookup: false};
}

export function getRelevantStudiesContext(
  query: string,
  mode: SpecialistMode,
): KnowledgeStudyCard[] {
  const lower = query.toLowerCase();
  const scored = PSYCHOLOGY_MARKETING_STUDIES.map((study) => {
    let score = 0;
    if (mode === 'psychology' && study.domain === 'psychology') score += 3;
    if (mode === 'marketing' && study.domain === 'marketing') score += 3;
    for (const kw of study.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += 5;
      }
    }
    return {study, score};
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((s) => s.score > 0).slice(0, 4).map((s) => s.study);
  if (matched.length > 0) return matched;
  if (mode === 'psychology') {
    return PSYCHOLOGY_MARKETING_STUDIES.filter((s) => s.domain === 'psychology').slice(0, 4);
  }
  if (mode === 'marketing') {
    return PSYCHOLOGY_MARKETING_STUDIES.filter((s) => s.domain === 'marketing').slice(0, 4);
  }
  return [];
}
