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
import {
  buildArabicMonthGrid,
  computeCalendarMonthStats,
  computeGoalLinkedProgress,
  computeHabitStreak,
  computeNextRecurrenceDate,
  hashLocalPin,
  verifyLocalPin,
} from '../src/storage/productivityUtils.ts';
import {
  getGoalStatusLabel,
  getTargetDateCountdown,
  resolveGoalPalette,
} from '../src/storage/goalTheme.ts';
import {buildLifeContextSnapshot} from '../src/storage/assistantContext.ts';
import {
  computeNextReminderTrigger,
  formatReminderRecurrenceArabic,
  formatTimeArabic12,
  inferReminderFieldsFromText,
  normalizeReminderRecurrence,
} from '../src/storage/reminderSchedule.ts';
import {
  detectSpecialistIntent,
  getRelevantStudiesContext,
  PSYCHOLOGY_MARKETING_STUDIES,
} from '../src/storage/psychologyMarketingKb.ts';
import {getScoreTone, normalizeAdAuditResult} from '../src/storage/adAuditTypes.ts';
import {
  evaluateWeeklyDriveBackupReminder,
  getDocumentExpiryInfo,
  SEVEN_DAYS_MS,
} from '../src/storage/documentsAndReminders.ts';
import type {DocumentItem, TaskItem} from '../src/types.ts';

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

test('computeNextRecurrenceDate handles daily, weekly, and month-end clamping', () => {
  assert.equal(computeNextRecurrenceDate('2026-11-23', 'none', '2026-11-23'), null);
  assert.equal(computeNextRecurrenceDate('2026-11-23', 'daily', '2026-11-23'), '2026-11-24');
  assert.equal(computeNextRecurrenceDate('2026-11-23', 'weekly', '2026-11-23'), '2026-11-30');
  // Month-end clamping: Jan 31 -> Feb 28 (non-leap year 2026)
  assert.equal(computeNextRecurrenceDate('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
  // Overdue recurring task schedules relative to today rather than the stale past date
  assert.equal(computeNextRecurrenceDate('2026-11-01', 'daily', '2026-11-23'), '2026-11-24');
});

test('computeGoalLinkedProgress calculates auto-progress from linked tasks', () => {
  const tasks: TaskItem[] = [
    makeTask({id: 'g-t1', goalId: 'goal-1', status: 'خلصت'}),
    makeTask({id: 'g-t2', goalId: 'goal-1', status: 'خلصت'}),
    makeTask({id: 'g-t3', goalId: 'goal-1', status: 'لسه'}),
    makeTask({id: 'other', goalId: null, status: 'خلصت'}),
  ];

  const linked = computeGoalLinkedProgress('goal-1', tasks);
  assert.equal(linked.linkedCount, 3);
  assert.equal(linked.doneCount, 2);
  assert.equal(linked.percent, 67);

  const unlinked = computeGoalLinkedProgress('goal-empty', tasks);
  assert.equal(unlinked.linkedCount, 0);
  assert.equal(unlinked.percent, null);
});

test('computeHabitStreak computes current streak, best streak, and 7-day strip', () => {
  const today = '2026-11-23';
  const summary = computeHabitStreak(
    {
      completedDates: [
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
      ],
    },
    today,
  );

  assert.equal(summary.doneToday, true);
  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.bestStreak, 4);
  assert.equal(summary.last7Days.length, 7);
  assert.equal(summary.last7Days[6].dateIso, today);
  assert.equal(summary.last7Days[6].done, true);
});

test('buildArabicMonthGrid builds Saturday-first month grid with 35 or 42 cells', () => {
  // November 2026 starts on Sunday (Nov 1, 2026) -> Saturday cell is Oct 31, 2026
  const cells = buildArabicMonthGrid(2026, 11);
  assert.equal(cells.length, 35);
  assert.equal(cells[0].dateIso, '2026-10-31');
  assert.equal(cells[0].inCurrentMonth, false);
  assert.equal(cells[1].dateIso, '2026-11-01');
  assert.equal(cells[1].inCurrentMonth, true);
});

test('hashLocalPin and verifyLocalPin validate 4-digit PINs without storing plaintext', () => {
  const hash = hashLocalPin('2580');
  assert.equal(hash.includes('2580'), false);
  assert.equal(verifyLocalPin('2580', hash), true);
  assert.equal(verifyLocalPin('1234', hash), false);
});

test('parseAndValidateBackup and mergeOmarsLifeStores preserve recurring tasks, subtasks, habits, focus sessions, pinned notes, and PIN lock', () => {
  const pinHash = hashLocalPin('4321');
  const raw = JSON.stringify({
    version: 1,
    tasks: [
      makeTask({
        id: 'rec-1',
        recurrence: 'weekly',
        goalId: 'goal-1',
        subtasks: [{id: 'st-1', title: 'خطوة أولى', done: true}],
      }),
    ],
    notes: [
      {
        id: 'pin-n1',
        title: 'ملاحظة مهمة',
        content: 'تفاصيل',
        category: 'شخصي',
        images: [],
        pinned: true,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    goals: [],
    habits: [
      {
        id: 'h-1',
        title: 'قراءة ١٥ دقيقة',
        completedDates: ['2026-11-23'],
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    focusSessions: [
      {
        id: 'fs-1',
        taskId: 'rec-1',
        taskTitle: 'مراجعة الخطة',
        durationMinutes: 25,
        completedAt: 2000,
        dateIso: '2026-11-23',
      },
    ],
    preferences: {
      pinLockEnabled: true,
      pinHash,
    },
  });

  const parsed = parseAndValidateBackup(raw);
  assert.equal(parsed.tasks[0].recurrence, 'weekly');
  assert.equal(parsed.tasks[0].goalId, 'goal-1');
  assert.equal(parsed.tasks[0].subtasks?.length, 1);
  assert.equal(parsed.notes[0].pinned, true);
  assert.equal(parsed.habits?.length, 1);
  assert.equal(parsed.focusSessions?.length, 1);
  assert.equal(parsed.preferences.pinLockEnabled, true);
  assert.equal(parsed.preferences.pinHash, pinHash);

  const merged = mergeOmarsLifeStores(createEmptyStore(), parsed);
  assert.equal(merged.merged.habits?.length, 1);
  assert.equal(merged.merged.focusSessions?.length, 1);
});

test('resolveGoalPalette, getGoalStatusLabel, and getTargetDateCountdown support auto & custom goal colors', () => {
  // Auto progress tones
  assert.equal(resolveGoalPalette(0, 'auto').tone, 'slate');
  assert.equal(resolveGoalPalette(20, 'auto').tone, 'amber');
  assert.equal(resolveGoalPalette(50, 'auto').tone, 'blue');
  assert.equal(resolveGoalPalette(85, 'auto').tone, 'teal');
  assert.equal(resolveGoalPalette(100, 'auto').tone, 'emerald');

  // Custom override ignores progress tier tone
  assert.equal(resolveGoalPalette(15, 'violet').tone, 'violet');
  assert.equal(resolveGoalPalette(90, 'rose').tone, 'rose');

  // Arabic status labels
  assert.equal(getGoalStatusLabel(0), 'لسه ما بدأش');
  assert.equal(getGoalStatusLabel(25), 'في البداية');
  assert.equal(getGoalStatusLabel(55), 'شغال عليه');
  assert.equal(getGoalStatusLabel(80), 'قربت تخلص');
  assert.equal(getGoalStatusLabel(100), 'مكتمل');

  // Target countdown
  assert.equal(getTargetDateCountdown('2026-11-23', 40, '2026-11-23')?.label, 'آخر يوم النهارده');
  assert.equal(getTargetDateCountdown('2026-11-20', 40, '2026-11-23')?.isOverdue, true);
  assert.equal(getTargetDateCountdown('2026-11-20', 100, '2026-11-23')?.label, 'تم الإنجاز');

  // Backup preserves custom color and defaults legacy goals to auto
  const parsed = parseAndValidateBackup(
    JSON.stringify({
      version: 1,
      tasks: [],
      notes: [],
      goals: [
        {
          id: 'g-color',
          kind: 'هدف',
          title: 'هدف ملون',
          description: '',
          targetDate: '2026-12-15',
          progress: 60,
          color: 'rose',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'g-legacy',
          kind: 'مشروع',
          title: 'مشروع قديم',
          description: '',
          targetDate: null,
          progress: 30,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    }),
  );
  assert.equal(parsed.goals[0].color, 'rose');
  assert.equal(parsed.goals[1].color, 'auto');
});

test('computeCalendarMonthStats summarizes monthly tasks, overdue items, goals, and busy days', () => {
  const today = '2026-11-23';
  const tasks: TaskItem[] = [
    makeTask({id: 'm-1', dueDate: '2026-11-10', status: 'خلصت'}),
    makeTask({id: 'm-2', dueDate: '2026-11-20', status: 'لسه'}), // overdue
    makeTask({id: 'm-3', dueDate: '2026-11-25', status: 'شغال عليها'}),
    makeTask({id: 'm-4', dueDate: '2026-12-02', status: 'لسه'}), // next month
    makeTask({id: 'm-5', dueDate: null, status: 'لسه'}), // unscheduled
  ];
  const goals = [
    {
      id: 'g-nov',
      kind: 'هدف' as const,
      title: 'هدف نوفمبر',
      description: '',
      targetDate: '2026-11-25',
      progress: 50,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'g-dec',
      kind: 'مشروع' as const,
      title: 'مشروع ديسمبر',
      description: '',
      targetDate: '2026-12-15',
      progress: 10,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const stats = computeCalendarMonthStats(2026, 11, tasks, goals, today);
  assert.equal(stats.monthPrefix, '2026-11');
  assert.equal(stats.totalTasks, 3);
  assert.equal(stats.completedTasks, 1);
  assert.equal(stats.pendingTasks, 2);
  assert.equal(stats.overdueTasks, 1);
  assert.equal(stats.goalsCount, 1);
  assert.equal(stats.busyDaysCount, 3); // Nov 10, Nov 20, Nov 25 (shared by task + goal)
  assert.equal(stats.completionRate, 33);
});

test('buildLifeContextSnapshot, backup validation, and Drive merge preserve assistant profile and memories', () => {
  const raw = JSON.stringify({
    version: 1,
    tasks: [
      makeTask({id: 'a-1', title: 'تقرير مهم', dueDate: '2026-11-20', status: 'لسه'}),
      makeTask({id: 'a-2', title: 'رياضة', dueDate: '2026-11-23', status: 'خلصت'}),
    ],
    notes: [],
    goals: [],
    habits: [
      {
        id: 'hab-1',
        title: 'قراءة ١٥ دقيقة',
        completedDates: ['2026-11-23'],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    assistantProfile: {
      roleAndWork: 'مطور برمجيات',
      dailyRoutine: 'بصحى ٧ الصبح وبشتغل من ٩ لـ ٥',
      topPriorities: 'تطوير نفسي وتنظيم وقتي',
      personalNotes: '',
      tone: 'coach',
      updatedAt: 5000,
    },
    assistantMemories: [
      {
        id: 'mem-1',
        category: 'روتين',
        fact: 'أفضل وقت للتركيز الصبح بدري',
        createdAt: 2000,
        updatedAt: 2000,
      },
    ],
    assistantMessages: [
      {
        id: 'msg-1',
        role: 'user',
        text: 'رتّبلي يومي',
        createdAt: 3000,
      },
    ],
  });

  const parsed = parseAndValidateBackup(raw);
  assert.equal(parsed.assistantProfile?.roleAndWork, 'مطور برمجيات');
  assert.equal(parsed.assistantProfile?.tone, 'coach');
  assert.equal(parsed.assistantMemories?.length, 1);
  assert.equal(parsed.assistantMessages?.length, 1);

  const snapshot = buildLifeContextSnapshot(parsed, '2026-11-23', '10:30');
  assert.equal(snapshot.todayIso, '2026-11-23');
  assert.equal(snapshot.profile.roleAndWork, 'مطور برمجيات');
  assert.equal(snapshot.memories[0].fact, 'أفضل وقت للتركيز الصبح بدري');
  assert.equal(snapshot.stats.activeTasksCount, 1);
  assert.equal(snapshot.stats.overdueTasksCount, 1);
  assert.equal(snapshot.habits[0].doneToday, true);

  const merged = mergeOmarsLifeStores(createEmptyStore(), parsed);
  assert.equal(merged.merged.assistantProfile?.roleAndWork, 'مطور برمجيات');
  assert.equal(merged.merged.assistantMemories?.length, 1);
  assert.equal(merged.merged.assistantMessages?.length, 1);
});

test('recurring reminder scheduler computes exact daily, weekly, and monthly triggers with Arabic formatting', () => {
  // Monday 2026-11-23 at 10:30 local time
  const mondayMorning = new Date(2026, 10, 23, 10, 30, 0, 0);

  // Daily at 08:00 has already passed today -> rolls to Tuesday 2026-11-24 08:00
  const nextDaily = new Date(computeNextReminderTrigger('08:00', 'daily', [], mondayMorning));
  assert.equal(nextDaily.getFullYear(), 2026);
  assert.equal(nextDaily.getMonth(), 10);
  assert.equal(nextDaily.getDate(), 24);
  assert.equal(nextDaily.getHours(), 8);
  assert.equal(nextDaily.getMinutes(), 0);

  // Weekly on Wednesday (ISO 3) and Friday (ISO 5) at 09:15 -> Wednesday 2026-11-25 09:15
  const nextWeekly = new Date(computeNextReminderTrigger('09:15', 'weekly', [3, 5], mondayMorning));
  assert.equal(nextWeekly.getDate(), 25);
  assert.equal(nextWeekly.getHours(), 9);
  assert.equal(nextWeekly.getMinutes(), 15);

  // Monthly on Jan 31 after 08:00 clamps safely to Feb 28 (non-leap year 2026)
  const jan31Late = new Date(2026, 0, 31, 12, 0, 0, 0);
  const nextMonthly = new Date(computeNextReminderTrigger('08:00', 'monthly', [], jan31Late));
  assert.equal(nextMonthly.getFullYear(), 2026);
  assert.equal(nextMonthly.getMonth(), 1); // February
  assert.equal(nextMonthly.getDate(), 28);
  assert.equal(nextMonthly.getHours(), 8);

  // Recurrence normalization and Arabic display formatting
  assert.equal(normalizeReminderRecurrence('DAILY'), 'daily');
  assert.equal(normalizeReminderRecurrence('unknown'), 'once');
  assert.equal(formatTimeArabic12('08:00'), '8:00 ص');
  assert.equal(formatTimeArabic12('20:45'), '8:45 م');
  assert.equal(formatReminderRecurrenceArabic('daily'), 'كل يوم');
  assert.equal(formatReminderRecurrenceArabic('weekly', [6, 1]), 'كل السبت، الإثنين');

  // Natural Egyptian Arabic & English extraction for AI reminder tool fallback
  const dailyAr = inferReminderFieldsFromText('فكرني كل يوم الساعة ٨ الصبح أشرب مية');
  assert.equal(dailyAr.reminderTime, '08:00');
  assert.equal(dailyAr.recurrence, 'daily');

  const weeklyAr = inferReminderFieldsFromText('اعمل لي تذكير كل سبت وتلات الساعة 9 ونص بالليل أروح الجيم');
  assert.equal(weeklyAr.reminderTime, '21:30');
  assert.equal(weeklyAr.recurrence, 'weekly');
  assert.deepEqual(weeklyAr.daysOfWeek, [6, 2]);

  const monthlyAr = inferReminderFieldsFromText('تذكير شهرياً الساعة 21:15 دفع فاتورة النت');
  assert.equal(monthlyAr.reminderTime, '21:15');
  assert.equal(monthlyAr.recurrence, 'monthly');

  const dailyEn = inferReminderFieldsFromText('Remind me every day at 7:30 am to stretch');
  assert.equal(dailyEn.reminderTime, '07:30');
  assert.equal(dailyEn.recurrence, 'daily');
});

test('detectSpecialistIntent and getRelevantStudiesContext route Egyptian psychology, marketing, and Egypt shop queries accurately', () => {
  assert.equal(PSYCHOLOGY_MARKETING_STUDIES.length >= 10, true);

  // Egypt shop intent detection
  const shopIntent = detectSpecialistIntent('عايز أحسن محلات لابتوب في مول البستان وسط البلد');
  assert.equal(shopIntent.resolvedMode, 'egypt_shops');
  assert.equal(shopIntent.useEgyptShopsLookup, true);

  // Psychology study intent detection
  const psychIntent = detectSpecialistIntent('اشرحلي نظرية التنافر المعرفي وعلم النفس السلوكي');
  assert.equal(psychIntent.resolvedMode, 'psychology');
  assert.equal(psychIntent.useGoogleSearch, true);

  // Marketing psychology intent detection
  const mktIntent = detectSpecialistIntent('إزاي أطبق مبادئ تشالديني في الإعلانات والتسعير؟');
  assert.equal(mktIntent.resolvedMode, 'marketing');
  assert.equal(mktIntent.useGoogleSearch, true);

  // Explicit mode override takes priority
  const explicitShop = detectSpecialistIntent('كافيه هادي للشغل', 'egypt_shops');
  assert.equal(explicitShop.resolvedMode, 'egypt_shops');
  assert.equal(explicitShop.useEgyptShopsLookup, true);

  // Relevant studies context picks Cialdini for persuasion marketing query
  const matchedStudies = getRelevantStudiesContext('مبادئ الإقناع تشالديني في التسويق', 'marketing');
  assert.equal(matchedStudies.length > 0, true);
  assert.equal(matchedStudies.some((s) => s.researcher.includes('Cialdini')), true);
});

test('normalizeAdAuditResult and getScoreTone clamp scores, normalize triggers, and keep 3 Egyptian ad rewrites', () => {
  assert.equal(getScoreTone(8.4), 'emerald');
  assert.equal(getScoreTone(6.2), 'amber');
  assert.equal(getScoreTone(3.5), 'rose');

  const normalized = normalizeAdAuditResult({
    overallScore: 14, // should clamp to 10
    verdictTitleAr: 'إعلان جيد لكن يحتاج Hook أقوى',
    summaryAr: 'ملخص التحليل',
    scores: {hook: 0, persuasion: 8.24, pricing: 6.5, clarityCta: 12},
    psychologyTriggers: [
      {principleAr: 'تجنب الخسارة', studyRef: 'Kahneman & Tversky', status: 'MISSING', noteAr: 'أضف تكلفة التأجيل'},
      {principleAr: 'الإثبات الاجتماعي', studyRef: 'Cialdini', status: 'invalid_val', noteAr: 'أضف تقييمات عملاء'},
    ],
    weaknessesAr: ['العنوان عام', ''],
    rewrittenVariations: [
      {angleAr: 'زاوية الخسارة', headlineAr: 'عنوان 1', bodyAr: 'نص 1', ctaAr: 'اطلب الآن'},
      {angleAr: 'زاوية القصة', headlineAr: 'عنوان 2', bodyAr: 'نص 2', ctaAr: 'ابعت رسالة'},
      {angleAr: 'زاوية العرض', headlineAr: 'عنوان 3', bodyAr: 'نص 3', ctaAr: 'احجز دلوقتي'},
      {angleAr: 'زيادة', headlineAr: 'عنوان 4', bodyAr: 'نص 4', ctaAr: 'غير مطلوب'},
    ],
  });

  assert.equal(normalized.overallScore, 10);
  assert.equal(normalized.scores.hook, 1);
  assert.equal(normalized.scores.persuasion, 8.2);
  assert.equal(normalized.scores.clarityCta, 10);
  assert.equal(normalized.psychologyTriggers[0].status, 'missing');
  assert.equal(normalized.psychologyTriggers[1].status, 'weak');
  assert.equal(normalized.weaknessesAr.length, 1);
  assert.equal(normalized.rewrittenVariations.length, 3);
});

test('getDocumentExpiryInfo respects per-document reminder lead time (month, week, day)', () => {
  const today = '2026-11-24';

  const docIn20DaysMonthLead = getDocumentExpiryInfo(
    {expiryDate: '2026-12-14', reminderLead: 'month'},
    today,
  );
  assert.equal(docIn20DaysMonthLead.daysLeft, 20);
  assert.equal(docIn20DaysMonthLead.isReminderActive, true);
  assert.equal(docIn20DaysMonthLead.state, 'due_soon');

  const docIn20DaysWeekLead = getDocumentExpiryInfo(
    {expiryDate: '2026-12-14', reminderLead: 'week'},
    today,
  );
  assert.equal(docIn20DaysWeekLead.isReminderActive, false);
  assert.equal(docIn20DaysWeekLead.state, 'active');

  const docIn5DaysWeekLead = getDocumentExpiryInfo(
    {expiryDate: '2026-11-29', reminderLead: 'week'},
    today,
  );
  assert.equal(docIn5DaysWeekLead.isReminderActive, true);
  assert.equal(docIn5DaysWeekLead.state, 'due_soon');

  const docIn5DaysDayLead = getDocumentExpiryInfo(
    {expiryDate: '2026-11-29', reminderLead: 'day'},
    today,
  );
  assert.equal(docIn5DaysDayLead.isReminderActive, false);

  const docTomorrowDayLead = getDocumentExpiryInfo(
    {expiryDate: '2026-11-25', reminderLead: 'day'},
    today,
  );
  assert.equal(docTomorrowDayLead.isReminderActive, true);
  assert.equal(docTomorrowDayLead.state, 'due_soon');

  const expiredDoc = getDocumentExpiryInfo(
    {expiryDate: '2026-11-20', reminderLead: 'day'},
    today,
  );
  assert.equal(expiredDoc.isReminderActive, true);
  assert.equal(expiredDoc.state, 'expired');
});

test('evaluateWeeklyDriveBackupReminder triggers after 7 days without sync and respects snooze', () => {
  const now = 1_800_000_000_000;
  const emptyStore = createEmptyStore();
  assert.equal(
    evaluateWeeklyDriveBackupReminder({lastSyncedAt: now - SEVEN_DAYS_MS * 2, store: emptyStore, now})
      .shouldRemind,
    false,
  );

  const populatedStore = {
    ...emptyStore,
    tasks: [makeTask({createdAt: now - SEVEN_DAYS_MS - 1000})],
  };

  assert.equal(
    evaluateWeeklyDriveBackupReminder({
      lastSyncedAt: now - 3 * 24 * 60 * 60 * 1000,
      store: populatedStore,
      now,
    }).shouldRemind,
    false,
  );

  const overdueRes = evaluateWeeklyDriveBackupReminder({
    lastSyncedAt: now - 8 * 24 * 60 * 60 * 1000,
    store: populatedStore,
    now,
  });
  assert.equal(overdueRes.shouldRemind, true);
  assert.equal(overdueRes.daysSinceLastSync, 8);
  assert.equal(overdueRes.neverSynced, false);

  assert.equal(
    evaluateWeeklyDriveBackupReminder({
      lastSyncedAt: now - 8 * 24 * 60 * 60 * 1000,
      store: populatedStore,
      now,
      snoozedUntil: now + 3600_000,
    }).shouldRemind,
    false,
  );

  const neverSyncedRes = evaluateWeeklyDriveBackupReminder({
    lastSyncedAt: null,
    store: populatedStore,
    now,
  });
  assert.equal(neverSyncedRes.shouldRemind, true);
  assert.equal(neverSyncedRes.neverSynced, true);
});

test('globalSearch and Drive merge include documents alongside tasks and notes', () => {
  const doc: DocumentItem = {
    id: 'doc-1',
    title: 'جواز السفر المصري',
    category: 'جواز سفر',
    documentNumber: 'A123456',
    expiryDate: '2027-05-10',
    reminderLead: 'week',
    notes: 'في الدرج الأول',
    createdAt: 1000,
    updatedAt: 2000,
  };

  const searchRes = searchAllLifeItems(
    {
      tasks: [makeTask({title: 'تجديد جواز السفر'})],
      notes: [],
      documents: [doc],
      goals: [],
    },
    'جواز',
  );
  assert.equal(searchRes.counts.all, 2);
  assert.equal(searchRes.counts.task, 1);
  assert.equal(searchRes.counts.document, 1);

  const docOnly = searchAllLifeItems(
    {tasks: [], notes: [], documents: [doc], goals: []},
    'A123456',
    'document',
  );
  assert.equal(docOnly.results.length, 1);
  assert.equal(docOnly.results[0].document?.reminderLead, 'week');

  const localStore = createEmptyStore();
  const remoteStore = {...createEmptyStore(), documents: [doc]};
  const {merged} = mergeOmarsLifeStores(localStore, remoteStore);
  assert.equal(merged.documents?.length, 1);
  assert.equal(merged.documents?.[0].reminderLead, 'week');

  const roundTrip = parseAndValidateBackup(JSON.stringify(merged));
  assert.equal(roundTrip.documents?.length, 1);
  assert.equal(roundTrip.documents?.[0].title, 'جواز السفر المصري');
});



