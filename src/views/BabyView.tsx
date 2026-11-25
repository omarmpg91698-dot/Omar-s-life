import React, {useMemo, useState} from 'react';
import {
  Baby,
  CalendarDays,
  Check,
  CheckCircle2,
  Luggage,
  Pencil,
  Plus,
  Sparkles,
  Stethoscope,
  Syringe,
  Trash2,
  X,
} from 'lucide-react';
import {useLife} from '../context/LifeContext';
import {formatFriendlyDate, getTodayIso} from '../storage/localStore';
import type {BabyAppointment} from '../types';

const DAY_MS = 86_400_000;

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PREGNANCY_TIPS: string[] = [
  'ركّزوا على حمض الفوليك وشرب مية كتير، وأي دوا لازم باستشارة الدكتور.',
  'الغثيان الصباحي شائع، وجبات صغيرة متكررة بتساعد كتير.',
  'التعب طبيعي في الفترة دي، النوم الكفاية أولوية.',
  'خلّي بالك من موعد أول سونار، عادة بين الأسبوع 6 و8.',
  'ابدأوا تصوّروا بطنها كل أسبوع، ذكرى حلوة بعدين.',
  'الرياضة الخفيفة زي المشي ممتازة بإذن الدكتور.',
  'قلّلوا الكافيين، واستبدلوه بعصاير طبيعية.',
  'وقت التفكير في ميزانية البيبي، اكتبوا قائمة الاحتياجات.',
  'السماع للجنين بيبدأ يتطور، كلمها وكلم البيبي.',
  'متابعة الوزن والضغط كل زيارة مهمة، سجلهم هنا في الملاحظات.',
  'البيبي بدأ يتحرك بس لسه مش حاسة بيه، قرب الموعد.',
  'الحجامير والملابس المريحة فرق كبير في راحتها.',
  'جهّزوا أسئلتكم للدكتور قبل كل زيارة، اكتبوها في ملاحظاتي.',
  'أول ركلات للبيبي بتبان غالبا بين الأسبوع 16 و20.',
  'الحديد والكالسيوم مهمين جدا في المرحلة دي.',
  'سونار التشوهات (الأسبوع 18-22) من أهم المواعيد، متتأجلش.',
  'اختاروا اسم البيبي بالراحة واستمتعوا بالنقاش.',
  'آلام الظهر شائعة، وسادة الحمل بتريّح النوم.',
  'ابدأوا تفكروا في تجهيز أوضة البيبي بهدوء.',
  'نص الطريق عدّى! الاحتفال الصغير مستحق.',
  'تحليل السكر عادة بين الأسبوع 24 و28، فكرها قبل الميعاد.',
  'حركة البيبي بقت واضحة، عدّوا الركلات وقت الراحة.',
  'تورم الرجلين طبيعي، الراحة ورفع الرجل بيساعدوا.',
  'ابدأوا قائمة شنطة المستشفى من دلوقتي، متستنوش الأخير.',
  'سونار النمو التالت بيطمن على وزن البيبي ووضعه.',
  'اختاروا مستشفى الولادة واعرفوا طريقها ومواعيدها.',
  'جهّزوا وسيلة المواصلات ليوم الولادة وخطة بديلة.',
  'تمارين التنفس بتساعد في الولادة، اتمرنوا عليها سوا.',
  'راجعوا شنطة المستشفى وقفلوها، الموعد قرب.',
  'الانقباضات الكاذبة طبيعية، الحقيقية منتظمة وبتزيد.',
  'كلم صاحب الشغل عن إجازة الأبوة من دلوقتي.',
  'جهّزوا رقم الدكتور والطوارئ في مكان واضح.',
  'كراسي البيبي للعربية لازم تتجرب قبل الولادة.',
  'البيبي بقى جاهز تقريبا، أي وقت من هنا ورايح طبيعي.',
  'علامات الولادة: مية الراس، انقباضات منتظمة، نزول سدادة.',
  'ناموا كويس الفترة دي، النوم بعدين حكاية تانية.',
  'راجعوا أوراق المستشفى والبطاقات في شنطة جاهزة.',
  'كل حاجة جاهزة، استمتعوا بآخر أيام الهدوء.',
  'الميعاد المتوقع وصل، كلم الدكتور مع أي علامة.',
  'بعد الميعاد بأسبوع بيكون فيه متابعة أقرب، متقلقوش الدكتور معاكم.',
];

const HOSPITAL_BAG: string[] = [
  'بطاقة الزوج والزوجة وأي تحاليل حديثة',
  'ملف متابعة الحمل والسونارات',
  'ملابس داخلية مريحة للأم',
  'فستان خروج مريح للأم',
  'شبشب خفيف وجوارب',
  'فوط صحية بعد الولادة',
  'مستلزمات نظافة شخصية (فرشة، معجون، غسول)',
  'شاحن موبايل وباور بانك',
  'ملابس البيبي (3-4 طقم قطن مقاس أول)',
  'بطانية البيبي وقبعة وجوارب',
  'حفاضات مقاس حديثي الولادة',
  'مناديل مبللة للأطفال',
  'كريم للحفاضات',
  'لبس خروج البيبي من المستشفى',
  'غطاء رضاعة (لو هترضع طبيعي)',
  'مضخة حليب (لو موجودة)',
  'وجبات خفيفة ومشروبات للزوج',
  'كاميرا أو موبايل فاضي للذكريات',
];

const MILESTONE_GROUPS: {label: string; items: string[]}[] = [
  {
    label: 'من 0 لـ 3 شهور',
    items: ['بيبتسم ابتسامة واعية', 'بيرفع راسه وهو على بطنه', 'بيتابع الحاجة بعينه', 'بيصدر أصوات (مناغاة)'],
  },
  {
    label: 'من 3 لـ 6 شهور',
    items: ['بيتقلب من بطنه لضهره', 'بيمسك الألعاب بإيده', 'بيضحك بصوت عالي', 'بيرد على اسمه'],
  },
  {
    label: 'من 6 لـ 9 شهور',
    items: ['بيقعد لوحده من غير سند', 'بدأ التسنين', 'بيزحف أو بيحاول', 'بيقول مقاطع زي بابا وماما'],
  },
  {
    label: 'من 9 لـ 12 شهر',
    items: ['بيقف متمسك في حاجة', 'بيشاور على اللي عايزه', 'بيمشي خطوات بمساعدة', 'بيفهم كلمات بسيطة'],
  },
];

const VACCINES: {id: string; ageMonths: number; label: string}[] = [
  {id: 'v_birth', ageMonths: 0, label: 'جرعة الولادة: BCG + التهاب كبدي B + شلل فموي'},
  {id: 'v_2m', ageMonths: 2, label: 'شهرين: خماسي + شلل فموي + روتا + مكورات رئوية'},
  {id: 'v_4m', ageMonths: 4, label: '4 شهور: نفس الجرعات (جرعة تانية)'},
  {id: 'v_6m', ageMonths: 6, label: '6 شهور: نفس الجرعات (جرعة تالتة) + شلل فموي'},
  {id: 'v_9m', ageMonths: 9, label: '9 شهور: الحصبة (جرعة أولى)'},
  {id: 'v_12m', ageMonths: 12, label: '12 شهر: MMR + مكورات رئوية منشطة'},
  {id: 'v_18m', ageMonths: 18, label: '18 شهر: خماسي منشطة + شلل فموي + MMR جرعة تانية'},
];

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00');
  const to = new Date(toIso + 'T00:00:00');
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function ageLabel(birthIso: string, todayIso: string): string {
  const days = Math.max(0, daysBetween(birthIso, todayIso));
  if (days < 7) return `${days} يوم`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} أسبوع`;
  const months = Math.floor(days / 30.44);
  return `${months} شهر`;
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export const BabyView: React.FC = () => {
  const {baby, updateBaby} = useLife();
  const todayIso = getTodayIso();

  const [setupName, setSetupName] = useState(baby.babyName);
  const [setupDate, setSetupDate] = useState(baby.dueDate ?? '');
  const [setupMode, setSetupMode] = useState<'pregnancy' | 'baby'>('pregnancy');
  const [editingDate, setEditingDate] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [apptTitle, setApptTitle] = useState('متابعة الحمل');
  const [apptDate, setApptDate] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [customBagItem, setCustomBagItem] = useState('');

  const isBabyBorn = Boolean(baby.birthDate);
  const hasStarted = Boolean(baby.dueDate || baby.birthDate);

  const daysLeft = baby.dueDate ? daysBetween(todayIso, baby.dueDate) : null;
  const pregnancyWeek =
    daysLeft !== null ? Math.min(42, Math.max(1, Math.floor((280 - daysLeft) / 7) + 1)) : null;
  const tip = pregnancyWeek !== null ? PREGNANCY_TIPS[Math.min(pregnancyWeek, 40) - 1] : null;

  const upcomingAppointments = useMemo(
    () =>
      [...baby.appointments]
        .filter((a) => !a.done)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [baby.appointments],
  );
  const pastAppointments = useMemo(
    () => baby.appointments.filter((a) => a.done).slice(0, 5),
    [baby.appointments],
  );

  const bagDoneCount = baby.bagDone.length + baby.bagCustom.filter((i) => i.done).length;
  const bagTotal = HOSPITAL_BAG.length + baby.bagCustom.length;
  const vaccinesDone = new Set(baby.vaccinesDone);
  const milestonesDone = new Set(baby.milestonesDone);

  const saveSetup = () => {
    if (setupMode === 'pregnancy') {
      if (!setupDate) return;
      updateBaby({babyName: setupName.trim(), dueDate: setupDate, birthDate: null});
    } else {
      if (!setupDate) return;
      updateBaby({babyName: setupName.trim(), birthDate: setupDate});
    }
    setEditingDate(false);
  };

  const markBorn = () => {
    updateBaby({birthDate: todayIso});
  };

  const addAppointment = () => {
    if (!apptDate || !apptTitle.trim()) return;
    const item: BabyAppointment = {
      id: `appt_${Date.now().toString(36)}`,
      title: apptTitle.trim(),
      date: apptDate,
      notes: apptNotes.trim(),
      done: false,
      createdAt: Date.now(),
    };
    updateBaby({appointments: [item, ...baby.appointments]});
    setApptDate('');
    setApptNotes('');
  };

  const toggleAppointment = (id: string) => {
    updateBaby({
      appointments: baby.appointments.map((a) => (a.id === id ? {...a, done: !a.done} : a)),
    });
  };

  const deleteAppointment = (id: string) => {
    updateBaby({appointments: baby.appointments.filter((a) => a.id !== id)});
  };

  const toggleBagItem = (idx: number) => {
    const id = `bag_${idx}`;
    updateBaby({
      bagDone: baby.bagDone.includes(id)
        ? baby.bagDone.filter((x) => x !== id)
        : [...baby.bagDone, id],
    });
  };

  const addCustomBagItem = () => {
    const title = customBagItem.trim();
    if (!title) return;
    updateBaby({
      bagCustom: [...baby.bagCustom, {id: `bagc_${Date.now().toString(36)}`, title, done: false}],
    });
    setCustomBagItem('');
  };

  const toggleCustomBagItem = (id: string) => {
    updateBaby({
      bagCustom: baby.bagCustom.map((i) => (i.id === id ? {...i, done: !i.done} : i)),
    });
  };

  const toggleVaccine = (id: string) => {
    updateBaby({
      vaccinesDone: vaccinesDone.has(id)
        ? baby.vaccinesDone.filter((x) => x !== id)
        : [...baby.vaccinesDone, id],
    });
  };

  const toggleMilestone = (id: string) => {
    updateBaby({
      milestonesDone: milestonesDone.has(id)
        ? baby.milestonesDone.filter((x) => x !== id)
        : [...baby.milestonesDone, id],
    });
  };

  if (!hasStarted) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">الطفل</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            متابعة الحمل والبيبي: العد التنازلي، مواعيد الدكتور، شنطة المستشفى، والتطعيمات
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <div className="mb-4 flex items-center gap-2">
            <Baby className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">يلا نبدأ</h2>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSetupMode('pregnancy')}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
                setupMode === 'pregnancy'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              لسه في الحمل
            </button>
            <button
              type="button"
              onClick={() => setSetupMode('baby')}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
                setupMode === 'baby'
                  ? 'border-accent bg-accent text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              البيبي اتولد
            </button>
          </div>
          <div className="space-y-3">
            <input
              className={inputCls}
              placeholder="اسم البيبي (اختياري)"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
            />
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              {setupMode === 'pregnancy' ? 'تاريخ الولادة المتوقع' : 'تاريخ الولادة'}
            </label>
            <input
              type="date"
              className={inputCls}
              value={setupDate}
              onChange={(e) => setSetupDate(e.target.value)}
            />
            <button
              type="button"
              onClick={saveSetup}
              disabled={!setupDate}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>ابدأ المتابعة</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const babyTitle = baby.babyName || 'البيبي';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">الطفل</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {isBabyBorn ? `${babyTitle} معاكم، تتبع نموه وتطعيماته` : 'العد التنازلي ومتابعة الحمل'}
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
        {!isBabyBorn && daysLeft !== null && pregnancyWeek !== null ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-accent tabular-nums" dir="ltr">
                  {Math.max(0, daysLeft)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">يوم متبقي للموعد المتوقع</p>
              </div>
              <div className="text-end">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  الأسبوع {pregnancyWeek}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatFriendlyDate(baby.dueDate!)}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{width: `${Math.min(100, Math.round((pregnancyWeek / 40) * 100))}%`}}
              />
            </div>
            {tip && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>نصيحة الأسبوع: {tip}</span>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={markBorn}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <Baby className="h-4 w-4" />
                <span>البيبي اتولد!</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditDate(baby.dueDate ?? '');
                  setEditingDate(true);
                }}
                aria-label="تعديل الموعد المتوقع"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            {editingDate && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="date"
                  className={inputCls}
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (editDate) updateBaby({dueDate: editDate});
                    setEditingDate(false);
                  }}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-accent text-white"
                  aria-label="حفظ"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDate(false)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-400 dark:border-slate-700"
                  aria-label="إلغاء"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{babyTitle}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                عمره {ageLabel(baby.birthDate!, todayIso)} — اتولد {formatFriendlyDate(baby.birthDate!)}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent dark:bg-slate-900">
              <Baby className="h-6 w-6" />
            </div>
          </div>
        )}
      </div>

      {/* Doctor appointments */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
        <div className="mb-3 flex items-center gap-2">
          <Stethoscope className="h-4.5 w-4.5 text-accent" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {isBabyBorn ? 'مواعيد دكتور الأطفال' : 'مواعيد دكتورة الحمل'}
          </h2>
        </div>
        <div className="mb-4 space-y-2">
          <input
            className={inputCls}
            placeholder="اسم الميعاد (مثال: متابعة شهرية، سونار)"
            value={apptTitle}
            onChange={(e) => setApptTitle(e.target.value)}
          />
          <input
            type="date"
            className={inputCls}
            value={apptDate}
            onChange={(e) => setApptDate(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="ملاحظات (اختياري)"
            value={apptNotes}
            onChange={(e) => setApptNotes(e.target.value)}
          />
          <button
            type="button"
            onClick={addAppointment}
            disabled={!apptDate || !apptTitle.trim()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>ضيف ميعاد</span>
          </button>
        </div>
        {upcomingAppointments.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">مفيش مواعيد جاية مسجلة</p>
        ) : (
          <ul className="space-y-2">
            {upcomingAppointments.map((a) => {
              const dLeft = daysBetween(todayIso, a.date);
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-700"
                >
                  <button
                    type="button"
                    onClick={() => toggleAppointment(a.id)}
                    aria-label="تم الميعاد"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-transparent transition-colors hover:border-accent dark:border-slate-600"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatFriendlyDate(a.date)}
                      {dLeft >= 0 ? ` — بعد ${dLeft} يوم` : ' — فات'}
                      {a.notes ? ` · ${a.notes}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAppointment(a.id)}
                    aria-label="مسح الميعاد"
                    className="text-slate-300 transition-colors hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pastAppointments.length > 0 && (
          <p className="mt-3 text-center text-[11px] text-slate-400">
            {pastAppointments.length} ميعاد خلص
          </p>
        )}
      </div>

      {!isBabyBorn && (
        /* Hospital bag */
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Luggage className="h-4.5 w-4.5 text-accent" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">شنطة المستشفى</h2>
            </div>
            <span className="text-xs font-semibold text-accent tabular-nums" dir="ltr">
              {bagDoneCount}/{bagTotal}
            </span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{width: `${bagTotal ? Math.round((bagDoneCount / bagTotal) * 100) : 0}%`}}
            />
          </div>
          <ul className="space-y-1.5">
            {HOSPITAL_BAG.map((item, idx) => {
              const id = `bag_${idx}`;
              const done = baby.bagDone.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggleBagItem(idx)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        done
                          ? 'border-accent bg-accent text-white'
                          : 'border-slate-300 text-transparent dark:border-slate-600'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span
                      className={`text-sm ${
                        done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {item}
                    </span>
                  </button>
                </li>
              );
            })}
            {baby.bagCustom.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleCustomBagItem(item.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      item.done
                        ? 'border-accent bg-accent text-white'
                        : 'border-slate-300 text-transparent dark:border-slate-600'
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span
                    className={`text-sm ${
                      item.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {item.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              className={inputCls}
              placeholder="ضيف حاجة للشنطة..."
              value={customBagItem}
              onChange={(e) => setCustomBagItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustomBagItem();
              }}
            />
            <button
              type="button"
              onClick={addCustomBagItem}
              aria-label="ضيف"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isBabyBorn && (
        <>
          {/* Milestones */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4.5 w-4.5 text-accent" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">محطات النمو</h2>
            </div>
            <div className="space-y-4">
              {MILESTONE_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                    {group.label}
                  </p>
                  <ul className="space-y-1.5">
                    {group.items.map((item, ii) => {
                      const id = `ms_${gi}_${ii}`;
                      const done = milestonesDone.has(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => toggleMilestone(id)}
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                done
                                  ? 'border-accent bg-accent text-white'
                                  : 'border-slate-300 text-transparent dark:border-slate-600'
                              }`}
                            >
                              <Check className="h-3 w-3" />
                            </span>
                            <span
                              className={`text-sm ${
                                done
                                  ? 'text-slate-400 line-through'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {item}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Vaccines */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
            <div className="mb-1 flex items-center gap-2">
              <Syringe className="h-4.5 w-4.5 text-accent" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">التطعيمات</h2>
            </div>
            <p className="mb-3 text-[11px] text-slate-400">
              حسب جدول وزارة الصحة التقريبي، أكّد المواعيد مع دكتور الأطفال
            </p>
            <ul className="space-y-1.5">
              {VACCINES.map((v) => {
                const done = vaccinesDone.has(v.id);
                const dueDate = new Date(baby.birthDate! + 'T00:00:00');
                dueDate.setDate(dueDate.getDate() + Math.round(v.ageMonths * 30.44));
                const dueIso = toLocalIso(dueDate);
                const isDue = !done && dueIso <= todayIso;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => toggleVaccine(v.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors ${
                        done
                          ? 'border-slate-100 bg-slate-50/60 dark:border-slate-700'
                          : isDue
                            ? 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30'
                            : 'border-slate-100 dark:border-slate-700'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          done
                            ? 'border-accent bg-accent text-white'
                            : 'border-slate-300 text-transparent dark:border-slate-600'
                        }`}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="flex-1">
                        <span
                          className={`block text-sm ${
                            done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {v.label}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {isDue ? 'مستحقة دلوقتي' : `تقريبا ${formatFriendlyDate(dueIso)}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {!isBabyBorn && (
        <div className="flex items-start gap-2 rounded-2xl bg-white p-4 text-[11px] text-slate-400 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>الموعد المتوقع تقديري، ومتابعة الدكتور هي المرجع الأساسي دايما.</span>
        </div>
      )}
    </div>
  );
};
