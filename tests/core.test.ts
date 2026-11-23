import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {buildOmarsLifeWorkbook} from '../src/storage/excelExport.ts';
import {
  createEmptyStore,
  formatReminderTime,
  isTaskDueToday,
  isTaskOverdue,
  isTaskReminderDueToday,
  isTaskUpcoming,
  parseAndValidateBackup,
} from '../src/storage/localStore.ts';
import {mergeOmarsLifeStores} from '../src/services/googleDriveSync.ts';
import {
  computeQueueReorderUpdates,
  computeSlotReorderUpdates,
  getSlotHourKey,
  partitionDayPlannerTasks,
  shiftTimeByHours,
} from '../src/storage/dayPlanner.ts';
import {normalizeSearchText, searchAllLifeItems} from '../src/storage/globalSearch.ts';
import {suggestSmartTaskTags} from '../src/storage/smartTagSuggestions.ts';
import {computeTagDistribution, UNTAGGED_LABEL} from '../src/storage/tagAnalytics.ts';
import {
  autoArchiveExpiredTasks,
  daysUntilAutoArchive,
  isTaskArchived,
} from '../src/storage/taskArchive.ts';
import {computeWeeklyTaskStats} from '../src/storage/weeklyAnalytics.ts';
import type {TaskItem} from '../src/types.ts';

function makeTask(overrides: Partial<TaskItem>): TaskItem {
  return {
    id: 't-1',
    title: 'مراجعة الخطة',
    dueDate: '2026-11-23',
    priority: 'مهم',
    status: 'لسه',
    tags: ['شغل'],
    reminderEnabled: true,
    reminderTime: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

test('createEmptyStore initializes zero sample items', () => {
  const store = createEmptyStore();
  assert.equal(store.tasks.length, 0);
  assert.equal(store.notes.length, 0);
  assert.equal(store.goals.length, 0);
  assert.equal(store.preferences.theme, 'light');
});

test('task date classification identifies due today, overdue, and upcoming tasks', () => {
  const today = '2026-11-23';
  const overdueTask = makeTask({dueDate: '2026-11-20', status: 'لسه'});
  const dueTodayTask = makeTask({dueDate: '2026-11-23', status: 'شغال عليها'});
  const upcomingTask = makeTask({dueDate: '2026-11-26', status: 'لسه'});
  const doneOverdueTask = makeTask({dueDate: '2026-11-18', status: 'خلصت'});

  assert.equal(isTaskOverdue(overdueTask, today), true);
  assert.equal(isTaskOverdue(doneOverdueTask, today), false);
  assert.equal(isTaskDueToday(dueTodayTask, today), true);
  assert.equal(isTaskUpcoming(upcomingTask, today), true);
});

test('parseAndValidateBackup validates tags and upgrades legacy tasks without tags', () => {
  const {tags: _omitted, ...legacyTask} = makeTask({});
  const validJson = JSON.stringify({
    version: 1,
    tasks: [makeTask({tags: ['بيت', 'شخصي']}), legacyTask],
    notes: [],
    goals: [],
  });
  const parsed = parseAndValidateBackup(validJson);
  assert.equal(parsed.tasks.length, 2);
  assert.deepEqual(parsed.tasks[0].tags, ['بيت', 'شخصي']);
  assert.deepEqual(parsed.tasks[1].tags, []);
  assert.deepEqual(parsed.preferences.taskTags, ['شغل', 'بيت', 'شخصي']);

  assert.throws(() => parseAndValidateBackup('{"version":999}'));
});

test('parseAndValidateBackup preserves custom and emptied taskTags preferences', () => {
  const withCustomTags = parseAndValidateBackup(
    JSON.stringify({
      version: 1,
      tasks: [],
      notes: [],
      goals: [],
      preferences: {
        theme: 'light',
        accent: 'teal',
        userName: 'عمر',
        defaultPriority: 'متوسط',
        taskTags: [' #صحة ', 'دراسة', 'صحة', ''],
      },
    }),
  );
  assert.deepEqual(withCustomTags.preferences.taskTags, ['صحة', 'دراسة']);

  const withEmptyTags = parseAndValidateBackup(
    JSON.stringify({
      version: 1,
      tasks: [],
      notes: [],
      goals: [],
      preferences: {
        theme: 'dark',
        accent: 'blue',
        userName: 'عمر',
        defaultPriority: 'مهم',
        taskTags: [],
      },
    }),
  );
  assert.deepEqual(withEmptyTags.preferences.taskTags, []);
});

test('task reminders flag active tasks due today unless muted or completed', () => {
  const today = '2026-11-23';
  const activeToday = makeTask({dueDate: today, status: 'لسه', reminderEnabled: true});
  const mutedToday = makeTask({dueDate: today, status: 'لسه', reminderEnabled: false});
  const doneToday = makeTask({dueDate: today, status: 'خلصت', reminderEnabled: true});
  const tomorrow = makeTask({dueDate: '2026-11-24', status: 'لسه', reminderEnabled: true});

  assert.equal(isTaskReminderDueToday(activeToday, today), true);
  assert.equal(isTaskReminderDueToday(mutedToday, today), false);
  assert.equal(isTaskReminderDueToday(doneToday, today), false);
  assert.equal(isTaskReminderDueToday(tomorrow, today), false);

  assert.equal(formatReminderTime('09:05'), '9:05 ص');
  assert.equal(formatReminderTime('15:30'), '3:30 م');
  assert.equal(formatReminderTime(null), '');
});

test('parseAndValidateBackup preserves note images and upgrades legacy notes without images', () => {
  const parsed = parseAndValidateBackup(
    JSON.stringify({
      version: 1,
      tasks: [],
      notes: [
        {
          id: 'n-1',
          title: 'ملاحظة بصورة',
          content: 'تفاصيل',
          category: 'شخصي',
          images: [{id: 'img-1', dataUrl: 'data:image/jpeg;base64,abc', name: 'لقطة'}],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'n-2',
          title: 'ملاحظة قديمة',
          content: 'كلام قديم',
          category: 'شغل',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      goals: [],
    }),
  );

  assert.equal(parsed.notes.length, 2);
  assert.equal(parsed.notes[0].images.length, 1);
  assert.equal(parsed.notes[0].images[0].dataUrl, 'data:image/jpeg;base64,abc');
  assert.deepEqual(parsed.notes[1].images, []);
});

test('buildOmarsLifeWorkbook builds Excel workbook with tasks, notes, goals, and summary sheets', () => {
  const wb = buildOmarsLifeWorkbook({
    tasks: [makeTask({title: 'تسليم التقرير', tags: ['شغل'], reminderTime: '14:00'})],
    notes: [
      {
        id: 'n-1',
        title: 'أفكار الأسبوع',
        content: 'محتوى الملاحظة',
        category: 'أفكار',
        images: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    goals: [
      {
        id: 'g-1',
        kind: 'هدف',
        title: 'تعلم لغة جديدة',
        description: '٣٠ دقيقة يومياً',
        targetDate: '2026-12-31',
        progress: 45,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });

  assert.deepEqual(wb.SheetNames, ['مهامي', 'ملاحظاتي', 'أهدافي ومشاريعي', 'ملخص البيانات']);
  const tasksRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['مهامي'], {header: 1});
  assert.equal(tasksRows[1][0], 'تسليم التقرير');
  assert.equal(tasksRows[1][4], 'شغل');
  const goalsRows = XLSX.utils.sheet_to_json<Array<string | number>>(wb.Sheets['أهدافي ومشاريعي'], {
    header: 1,
  });
  assert.equal(goalsRows[1][1], 'تعلم لغة جديدة');
  assert.equal(goalsRows[1][3], 45);
});

test('computeWeeklyTaskStats calculates completed vs remaining ratios across the week', () => {
  // 2026-11-23 is a Monday -> Egypt current_week is Sat 2026-11-21 .. Fri 2026-11-27
  const today = '2026-11-23';
  const tasks: TaskItem[] = [
    makeTask({id: 'w-1', dueDate: '2026-11-21', status: 'خلصت'}),
    makeTask({id: 'w-2', dueDate: '2026-11-23', status: 'خلصت'}),
    makeTask({id: 'w-3', dueDate: '2026-11-23', status: 'لسه'}),
    makeTask({id: 'w-4', dueDate: '2026-11-25', status: 'شغال عليها'}),
    makeTask({id: 'w-old', dueDate: '2026-11-01', status: 'خلصت'}),
  ];

  const currentWeek = computeWeeklyTaskStats(tasks, today, 'current_week');
  assert.equal(currentWeek.days.length, 7);
  assert.equal(currentWeek.days[0].iso, '2026-11-21');
  assert.equal(currentWeek.days[6].iso, '2026-11-27');
  assert.equal(currentWeek.weeklyCompleted, 2);
  assert.equal(currentWeek.weeklyRemaining, 2);
  assert.equal(currentWeek.weeklyTotal, 4);
  assert.equal(currentWeek.weeklyPercent, 50);
  assert.equal(currentWeek.overallTotal, 5);
  assert.equal(currentWeek.overallCompleted, 3);

  const last7 = computeWeeklyTaskStats(tasks, today, 'last_7_days');
  assert.equal(last7.days[0].iso, '2026-11-17');
  assert.equal(last7.days[6].iso, '2026-11-23');
  assert.equal(last7.weeklyCompleted, 2);
  assert.equal(last7.weeklyRemaining, 1);
  assert.equal(last7.weeklyPercent, 67);
});

test('mergeOmarsLifeStores merges cross-device tasks, notes, goals, and tags by newest updatedAt', () => {
  const local = createEmptyStore();
  local.tasks = [
    makeTask({id: 'shared-1', title: 'نسخة قديمة محلية', status: 'لسه', updatedAt: 1000}),
    makeTask({id: 'local-only', title: 'مهمة على الموبايل', updatedAt: 2000}),
  ];
  local.preferences.taskTags = ['شغل', 'صحة'];

  const remote = createEmptyStore();
  remote.tasks = [
    makeTask({id: 'shared-1', title: 'نسخة أحدث من اللابتوب', status: 'خلصت', updatedAt: 5000}),
    makeTask({id: 'remote-only', title: 'مهمة من اللابتوب', updatedAt: 3000}),
  ];
  remote.preferences.taskTags = ['شغل', 'سفر'];

  const {merged, stats} = mergeOmarsLifeStores(local, remote);
  assert.equal(merged.tasks.length, 3);
  assert.equal(stats.addedTasks, 1);
  assert.equal(stats.updatedTasks, 1);
  const shared = merged.tasks.find((t) => t.id === 'shared-1');
  assert.equal(shared?.title, 'نسخة أحدث من اللابتوب');
  assert.equal(shared?.status, 'خلصت');
  assert.deepEqual(merged.preferences.taskTags, ['شغل', 'صحة', 'سفر']);
});

test('partitionDayPlannerTasks groups timed tasks by hour and collects unscheduled tasks', () => {
  const today = '2026-11-23';
  assert.equal(getSlotHourKey('09:30'), '09:00');
  assert.equal(getSlotHourKey('14:00'), '14:00');
  assert.equal(getSlotHourKey(null), null);

  const tasks: TaskItem[] = [
    makeTask({id: 's-1', title: 'اجتماع الصبح', dueDate: today, reminderTime: '09:30', status: 'لسه'}),
    makeTask({id: 's-2', title: 'مراجعة الكود', dueDate: today, reminderTime: '09:00', status: 'خلصت'}),
    makeTask({id: 'u-1', title: 'مهمة النهارده بدون وقت', dueDate: today, reminderTime: null, status: 'لسه'}),
    makeTask({id: 'u-2', title: 'مهمة متأخرة', dueDate: '2026-11-20', reminderTime: null, status: 'لسه'}),
    makeTask({id: 'u-3', title: 'مهمة بدون تاريخ', dueDate: null, reminderTime: null, status: 'لسه'}),
    makeTask({id: 'tom-1', title: 'مهمة بكره', dueDate: '2026-11-24', reminderTime: '11:00', status: 'لسه'}),
  ];

  const todayPlan = partitionDayPlannerTasks(tasks, today, today);
  assert.equal(todayPlan.scheduledCount, 2);
  assert.equal(todayPlan.completedScheduledCount, 1);
  assert.equal(todayPlan.scheduledByHour['09:00'].length, 2);
  assert.equal(todayPlan.scheduledByHour['09:00'][0].id, 's-1'); // active before completed
  assert.equal(todayPlan.unscheduledTasks.length, 3);
  assert.equal(todayPlan.unscheduledTasks[0].id, 'u-1'); // due today first

  const tomorrowPlan = partitionDayPlannerTasks(tasks, '2026-11-24', today);
  assert.equal(tomorrowPlan.scheduledCount, 1);
  assert.equal(tomorrowPlan.scheduledByHour['11:00'][0].id, 'tom-1');
  assert.equal(tomorrowPlan.unscheduledTasks.length, 0);

  const allOpenToday = partitionDayPlannerTasks(tasks, today, today, true);
  assert.equal(allOpenToday.unscheduledTasks.length, 4); // includes tomorrow's open task
  assert.equal(shiftTimeByHours('09:30', 1), '10:30');
  assert.equal(shiftTimeByHours('06:00', -1), null);
});

test('searchAllLifeItems normalizes Arabic text and searches across tasks, notes, and goals', () => {
  assert.equal(normalizeSearchText('أفكار وملاحظة مهمّة'), 'افكار وملاحظه مهمه');

  const data = {
    tasks: [
      makeTask({id: 't-1', title: 'إرسال تقرير الشهر', tags: ['شغل']}),
      makeTask({id: 't-2', title: 'شراء طلبات البيت', tags: ['بيت']}),
    ],
    notes: [
      {
        id: 'n-1',
        title: 'أفكار للتقرير الربع سنوي',
        content: 'ملخص الأرقام والمبيعات',
        category: 'شغل' as const,
        images: [],
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    goals: [
      {
        id: 'g-1',
        kind: 'مشروع' as const,
        title: 'إطلاق تطبيق شخصي',
        description: 'خطة تطوير التقرير الأسبوعي',
        targetDate: '2026-12-30',
        progress: 60,
        createdAt: 1000,
        updatedAt: 3000,
      },
    ],
  };

  // Search without hamza ("ارسال تقرير") still matches "إرسال تقرير الشهر"
  const taskSearch = searchAllLifeItems(data, 'ارسال تقرير');
  assert.equal(taskSearch.counts.all, 1);
  assert.equal(taskSearch.results[0].kind, 'task');
  assert.equal(taskSearch.results[0].id, 't-1');

  // Broad query ("تقرير") matches across tasks, notes, and goals
  const broad = searchAllLifeItems(data, 'تقرير');
  assert.equal(broad.counts.all, 3);
  assert.equal(broad.counts.task, 1);
  assert.equal(broad.counts.note, 1);
  assert.equal(broad.counts.goal, 1);

  // Filtered search returns only goals while preserving total counts
  const onlyGoals = searchAllLifeItems(data, 'تقرير', 'goal');
  assert.equal(onlyGoals.results.length, 1);
  assert.equal(onlyGoals.results[0].id, 'g-1');
  assert.equal(onlyGoals.counts.all, 3);
});

test('parseAndValidateBackup supports all dynamic accent color preferences and defaults to teal', () => {
  for (const accent of ['teal', 'blue', 'indigo', 'emerald', 'violet'] as const) {
    const parsed = parseAndValidateBackup(
      JSON.stringify({
        version: 1,
        tasks: [],
        notes: [],
        goals: [],
        preferences: {accent},
      }),
    );
    assert.equal(parsed.preferences.accent, accent);
  }

  const fallback = parseAndValidateBackup(
    JSON.stringify({version: 1, tasks: [], notes: [], goals: []}),
  );
  assert.equal(fallback.preferences.accent, 'teal');
});

test('suggestSmartTaskTags suggests tags from Arabic/English keywords, custom tags, and history', () => {
  const availableTags = ['شغل', 'بيت', 'شخصي', 'عربية'];

  // Keyword match: "اجتماع" -> "شغل"
  const meetingSuggestions = suggestSmartTaskTags({
    title: 'اجتماع الفريق الأسبوعي',
    availableTags,
    selectedTags: [],
  });
  assert.equal(meetingSuggestions[0]?.tag, 'شغل');
  assert.equal(meetingSuggestions[0]?.isNewTag, false);

  // Excludes already-selected tags
  const afterSelected = suggestSmartTaskTags({
    title: 'اجتماع الفريق الأسبوعي',
    availableTags,
    selectedTags: ['شغل'],
  });
  assert.equal(afterSelected.some((s) => s.tag === 'شغل'), false);

  // Matches custom user tag with Arabic "ال" prefix ("العربية" -> "عربية")
  const customMatch = suggestSmartTaskTags({
    title: 'تغيير زيت العربية',
    availableTags,
    selectedTags: [],
  });
  assert.equal(customMatch[0]?.tag, 'عربية');
  assert.equal(customMatch[0]?.source, 'custom');

  // Learns from previous tasks history
  const historyMatch = suggestSmartTaskTags({
    title: 'تجهيز بودكاست الحلقة الجاية',
    availableTags: ['شغل', 'بيت', 'محتوى'],
    selectedTags: [],
    existingTasks: [
      makeTask({id: 'p-1', title: 'تسجيل بودكاست جديد', tags: ['محتوى']}),
    ],
  });
  assert.equal(historyMatch[0]?.tag, 'محتوى');
  assert.equal(historyMatch[0]?.source, 'history');
});

test('computeTagDistribution calculates task counts, shares, and completion rates per tag', () => {
  const tasks: TaskItem[] = [
    makeTask({id: 'd-1', tags: ['شغل'], status: 'خلصت'}),
    makeTask({id: 'd-2', tags: ['شغل', 'شخصي'], status: 'لسه'}),
    makeTask({id: 'd-3', tags: ['بيت'], status: 'شغال عليها'}),
    makeTask({id: 'd-4', tags: [], status: 'لسه'}),
  ];

  const all = computeTagDistribution(tasks, 'all');
  assert.equal(all.totalTasksInScope, 4);
  assert.equal(all.totalAssignments, 5); // 2 شغل + 1 شخصي + 1 بيت + 1 بدون تصنيف
  assert.equal(all.topTag?.tag, 'شغل');
  assert.equal(all.topTag?.total, 2);
  assert.equal(all.topTag?.completed, 1);
  assert.equal(all.topTag?.remaining, 1);
  assert.equal(all.topTag?.completionRate, 50);
  assert.equal(all.topTag?.sharePercent, 40);
  assert.equal(all.buckets.some((b) => b.tag === UNTAGGED_LABEL && b.isUntagged), true);

  const completedOnly = computeTagDistribution(tasks, 'completed');
  assert.equal(completedOnly.totalTasksInScope, 1);
  assert.equal(completedOnly.buckets.length, 1);
  assert.equal(completedOnly.buckets[0].tag, 'شغل');
  assert.equal(completedOnly.buckets[0].sharePercent, 100);
});

test('Day Planner drag-and-drop reordering computes persistent plannerOrder across slots and queue', () => {
  const today = '2026-11-23';
  const t1 = makeTask({id: 'a', title: 'أول مهمة', dueDate: today, reminderTime: '09:00', plannerOrder: 0});
  const t2 = makeTask({id: 'b', title: 'تاني مهمة', dueDate: today, reminderTime: '09:00', plannerOrder: 1});
  const t3 = makeTask({id: 'c', title: 'تالت مهمة', dueDate: today, reminderTime: '11:00', plannerOrder: 0});

  // Reorder "b" before "a" inside 09:00
  const reorderSameSlot = computeSlotReorderUpdates({
    draggedTaskId: 'b',
    slotTasks: [t1, t2],
    slotTime24: '09:00',
    selectedDateIso: today,
    targetTaskId: 'a',
    position: 'before',
  });
  assert.equal(reorderSameSlot[0].id, 'b');
  assert.equal(reorderSameSlot[0].patch.plannerOrder, 0);
  assert.equal(reorderSameSlot[1].id, 'a');
  assert.equal(reorderSameSlot[1].patch.plannerOrder, 1);

  // Apply patches and verify partitionDayPlannerTasks respects new plannerOrder + orderedScheduledTasks
  const patchMap = new Map(reorderSameSlot.map((p) => [p.id, p.patch]));
  const updatedTasks = [t1, t2, t3].map((t) =>
    patchMap.has(t.id) ? {...t, ...patchMap.get(t.id)} : t,
  );
  const plan = partitionDayPlannerTasks(updatedTasks, today, today);
  assert.deepEqual(
    plan.scheduledByHour['09:00'].map((t) => t.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    plan.orderedScheduledTasks.map((t) => t.id),
    ['b', 'a', 'c'],
  );

  // Reorder queue drops "c" before unscheduled task "u1" and clears reminderTime
  const u1 = makeTask({id: 'u1', title: 'غير مجدولة', dueDate: today, reminderTime: null});
  const queuePatches = computeQueueReorderUpdates({
    draggedTaskId: 'c',
    queueTasks: [u1],
    targetTaskId: 'u1',
    position: 'before',
  });
  assert.equal(queuePatches[0].id, 'c');
  assert.equal(queuePatches[0].patch.reminderTime, null);
  assert.equal(queuePatches[0].patch.plannerOrder, 0);
  assert.equal(queuePatches[1].id, 'u1');
  assert.equal(queuePatches[1].patch.plannerOrder, 1);

  // Backup validation preserves plannerOrder
  const parsed = parseAndValidateBackup(
    JSON.stringify({version: 1, tasks: updatedTasks, notes: [], goals: []}),
  );
  assert.equal(parsed.tasks.find((t) => t.id === 'b')?.plannerOrder, 0);
  assert.equal(parsed.tasks.find((t) => t.id === 'a')?.plannerOrder, 1);
});

test('computeTagDistribution defaults to completed tasks and filters by timeframe', () => {
  const nowMs = Date.parse('2026-11-23T12:00:00Z');
  const dayMs = 24 * 60 * 60 * 1000;
  const tasks: TaskItem[] = [
    makeTask({
      id: 'c-1',
      tags: ['شغل'],
      status: 'خلصت',
      dueDate: '2026-11-22',
      updatedAt: nowMs - 1 * dayMs,
    }),
    makeTask({
      id: 'c-2',
      tags: ['شغل'],
      status: 'لسه',
      dueDate: '2026-11-23',
      updatedAt: nowMs - 1 * dayMs,
    }),
    makeTask({
      id: 'c-3',
      tags: ['بيت'],
      status: 'خلصت',
      dueDate: '2026-10-01',
      updatedAt: nowMs - 50 * dayMs,
    }),
  ];

  // Default scope is 'completed' across all time
  const defaultCompleted = computeTagDistribution(tasks, 'completed', 'all_time', nowMs);
  assert.equal(defaultCompleted.totalTasksInScope, 2);
  assert.equal(defaultCompleted.activeTagCount, 2);
  const workBucket = defaultCompleted.buckets.find((b) => b.tag === 'شغل');
  assert.equal(workBucket?.completed, 1);
  assert.equal(workBucket?.completionRate, 50); // 1 completed out of 2 total #شغل tasks

  // 7-day filter excludes task completed 50 days ago
  const recent7d = computeTagDistribution(tasks, 'completed', '7d', nowMs);
  assert.equal(recent7d.totalTasksInScope, 1);
  assert.equal(recent7d.activeTagCount, 1);
  assert.equal(recent7d.topTag?.tag, 'شغل');
  assert.equal(recent7d.topTag?.sharePercent, 100);
});

test('suggestSmartTaskTags handles office/meeting Arabic prefixes, colloquial keywords, and dismissed tags', () => {
  const availableTags = ['شغل', 'بيت', 'شخصي'];

  const officeMatch = suggestSmartTaskTags({
    title: 'تجهيز ملفات في المكتب',
    availableTags,
    selectedTags: [],
  });
  assert.equal(officeMatch[0]?.tag, 'شغل');
  assert.equal(officeMatch[0]?.matchedKeyword, 'مكتب');

  const dismissed = suggestSmartTaskTags({
    title: 'تجهيز ملفات في المكتب',
    availableTags,
    selectedTags: [],
    dismissedTags: ['شغل'],
  });
  assert.equal(dismissed.some((s) => s.tag === 'شغل'), false);

  const repairMatch = suggestSmartTaskTags({
    title: 'تصليح الحنفية وترويق الشقة',
    availableTags,
    selectedTags: [],
  });
  assert.equal(repairMatch[0]?.tag, 'بيت');
});

test('autoArchiveExpiredTasks archives completed tasks older than 30 days and preserves recent or active tasks', () => {
  const nowMs = Date.parse('2026-11-23T12:00:00Z');
  const dayMs = 24 * 60 * 60 * 1000;

  const oldDone = makeTask({
    id: 'old-done',
    title: 'مهمة خلصت من ٤٥ يوم',
    status: 'خلصت',
    completedAt: nowMs - 45 * dayMs,
    updatedAt: nowMs - 45 * dayMs,
  });
  const recentDone = makeTask({
    id: 'recent-done',
    title: 'مهمة خلصت من ١٠ أيام',
    status: 'خلصت',
    completedAt: nowMs - 10 * dayMs,
    updatedAt: nowMs - 10 * dayMs,
  });
  const oldOpen = makeTask({
    id: 'old-open',
    title: 'مهمة مفتوحة قديمة',
    status: 'لسه',
    updatedAt: nowMs - 60 * dayMs,
  });

  const result = autoArchiveExpiredTasks([oldDone, recentDone, oldOpen], nowMs, 30);
  assert.equal(result.archivedCount, 1);
  assert.deepEqual(result.archivedIds, ['old-done']);

  const archivedItem = result.tasks.find((t) => t.id === 'old-done')!;
  const recentItem = result.tasks.find((t) => t.id === 'recent-done')!;
  const openItem = result.tasks.find((t) => t.id === 'old-open')!;

  assert.equal(isTaskArchived(archivedItem), true);
  assert.equal(isTaskArchived(recentItem), false);
  assert.equal(isTaskArchived(openItem), false);
  assert.equal(daysUntilAutoArchive(recentItem, nowMs, 30), 20);
  assert.equal(daysUntilAutoArchive(archivedItem, nowMs, 30), null);

  // Backup validation preserves completedAt, archivedAt, and autoArchiveDays
  const parsed = parseAndValidateBackup(
    JSON.stringify({
      version: 1,
      tasks: result.tasks,
      notes: [],
      goals: [],
      preferences: {autoArchiveEnabled: true, autoArchiveDays: 30},
    }),
  );
  assert.equal(isTaskArchived(parsed.tasks.find((t) => t.id === 'old-done')!), true);
  assert.equal(parsed.preferences.autoArchiveDays, 30);
});










