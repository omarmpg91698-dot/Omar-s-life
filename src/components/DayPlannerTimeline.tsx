import React, {useMemo, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  GripVertical,
  Plus,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react';
import {SmartTagSuggestionsBar} from './SmartTagSuggestionsBar';
import {useLife} from '../context/LifeContext';
import {
  buildPlannerHours,
  computeQueueReorderUpdates,
  computeSlotReorderUpdates,
  getSlotHourKey,
  partitionDayPlannerTasks,
  shiftTimeByHours,
  type DropPosition,
  type PlannerTaskPatch,
} from '../storage/dayPlanner';
import {
  formatFriendlyDate,
  formatReminderTime,
  getOffsetIso,
  getTodayIso,
  isTaskOverdue,
} from '../storage/localStore';
import {
  suggestSmartTaskTags,
  type SmartTagSuggestion,
} from '../storage/smartTagSuggestions';
import type {TaskItem, TaskPriority} from '../types';

type DayTarget = 'today' | 'tomorrow';
type HoursRange = 'workday' | 'full';
type QueueScope = 'day' | 'all';
type TimelineMode = 'hourly' | 'agenda';

interface TaskSnapshot {
  id: string;
  dueDate: string | null;
  reminderTime: string | null;
  reminderEnabled: boolean;
  plannerOrder?: number;
}

interface UndoActionState {
  snapshots: TaskSnapshot[];
  message: string;
}

interface DropIndicator {
  zone: 'slot' | 'agenda' | 'queue';
  targetTaskId: string;
  position: DropPosition;
  slotTime24?: string;
}

function priorityTextClass(priority: TaskPriority): string {
  switch (priority) {
    case 'مهم':
      return 'text-red-600 dark:text-red-400';
    case 'متوسط':
      return 'text-amber-700 dark:text-amber-400';
    case 'عادي':
      return 'text-slate-500 dark:text-slate-400';
  }
}

export const DayPlannerTimeline: React.FC = () => {
  const {tasks, preferences, addTask, addTaskTag, updateTask, batchUpdateTasks} = useLife();
  const todayIso = getTodayIso();
  const tomorrowIso = getOffsetIso(1);

  const [dayTarget, setDayTarget] = useState<DayTarget>('today');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('hourly');
  const [hoursRange, setHoursRange] = useState<HoursRange>('workday');
  const [queueScope, setQueueScope] = useState<QueueScope>('day');

  // Drag & Drop state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [dragOverUnscheduled, setDragOverUnscheduled] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  // Tap-to-place state for mobile/keyboard accessibility
  const [pickedTaskId, setPickedTaskId] = useState<string | null>(null);

  // Undo last schedule / reorder action
  const [lastUndo, setLastUndo] = useState<UndoActionState | null>(null);

  // Inline quick-add task directly inside a timeline slot
  const [addingSlotTime, setAddingSlotTime] = useState<string | null>(null);
  const [slotTaskTitle, setSlotTaskTitle] = useState('');
  const [slotTaskTags, setSlotTaskTags] = useState<string[]>([]);

  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const slotSmartSuggestions = useMemo(
    () =>
      suggestSmartTaskTags({
        title: slotTaskTitle,
        availableTags: preferences.taskTags,
        selectedTags: slotTaskTags,
        existingTasks: tasks,
      }),
    [slotTaskTitle, preferences.taskTags, slotTaskTags, tasks],
  );

  const handleAcceptSlotTag = (suggestion: SmartTagSuggestion) => {
    if (suggestion.isNewTag) {
      addTaskTag(suggestion.tag);
    }
    setSlotTaskTags((prev) =>
      prev.includes(suggestion.tag) ? prev : [...prev, suggestion.tag],
    );
  };

  const selectedDateIso = dayTarget === 'today' ? todayIso : tomorrowIso;
  const currentHour = new Date().getHours();
  const currentHourKey = `${String(currentHour).padStart(2, '0')}:00`;

  const partition = useMemo(
    () => partitionDayPlannerTasks(tasks, selectedDateIso, todayIso, queueScope === 'all'),
    [tasks, selectedDateIso, todayIso, queueScope],
  );

  const baseSlots = useMemo(() => {
    const slots = hoursRange === 'full' ? buildPlannerHours(6, 23) : buildPlannerHours(8, 20);
    const existingKeys = new Set(slots.map((s) => s.time24));
    const extraHours: number[] = [];
    for (const key of Object.keys(partition.scheduledByHour)) {
      if (!existingKeys.has(key)) {
        const h = Number(key.slice(0, 2));
        if (!Number.isNaN(h)) extraHours.push(h);
      }
    }
    if (extraHours.length === 0) return slots;
    const allHours = Array.from(new Set([...slots.map((s) => s.hour), ...extraHours])).sort(
      (a, b) => a - b,
    );
    return allHours.map((h) => {
      const time24 = `${String(h).padStart(2, '0')}:00`;
      return {hour: h, time24, label: formatReminderTime(time24)};
    });
  }, [hoursRange, partition.scheduledByHour]);

  const pickedTask = useMemo(
    () => (pickedTaskId ? tasks.find((t) => t.id === pickedTaskId) ?? null : null),
    [pickedTaskId, tasks],
  );

  const completionPercent =
    partition.scheduledCount === 0
      ? 0
      : Math.round((partition.completedScheduledCount / partition.scheduledCount) * 100);

  const clearDragState = () => {
    setDraggingTaskId(null);
    setDragOverSlot(null);
    setDragOverUnscheduled(false);
    setDropIndicator(null);
  };

  const commitPatchesWithUndo = (patches: PlannerTaskPatch[], message: string) => {
    if (patches.length === 0) return;
    const snapshots: TaskSnapshot[] = [];
    for (const p of patches) {
      const existing = tasks.find((t) => t.id === p.id);
      if (existing) {
        snapshots.push({
          id: existing.id,
          dueDate: existing.dueDate,
          reminderTime: existing.reminderTime,
          reminderEnabled: existing.reminderEnabled,
          plannerOrder: existing.plannerOrder,
        });
      }
    }
    if (snapshots.length > 0) {
      setLastUndo({snapshots, message});
    }
    batchUpdateTasks(patches);
  };

  const assignOrReorderInSlot = (
    taskId: string,
    slotTime24: string,
    targetTaskId: string | null = null,
    position: DropPosition = 'after',
  ) => {
    const dragged = tasks.find((t) => t.id === taskId);
    if (!dragged) return;
    const currentSlotTasks = partition.scheduledByHour[slotTime24] ?? [];
    const sameSlot =
      dragged.dueDate === selectedDateIso && getSlotHourKey(dragged.reminderTime) === slotTime24;

    if (sameSlot && targetTaskId === taskId) {
      clearDragState();
      return;
    }

    const patches = computeSlotReorderUpdates({
      draggedTaskId: taskId,
      slotTasks: currentSlotTasks,
      slotTime24:
        sameSlot && dragged.reminderTime ? dragged.reminderTime : slotTime24,
      selectedDateIso,
      targetTaskId,
      position,
    });

    const feedback = sameSlot
      ? `تم إعادة ترتيب «${dragged.title}» داخل الساعة ${formatReminderTime(slotTime24)}.`
      : `تم جدولة «${dragged.title}» الساعة ${formatReminderTime(slotTime24)}.`;

    commitPatchesWithUndo(patches, feedback);
    setPickedTaskId(null);
    clearDragState();
  };

  const reorderOrUnscheduleInQueue = (
    taskId: string,
    targetTaskId: string | null = null,
    position: DropPosition = 'after',
  ) => {
    const dragged = tasks.find((t) => t.id === taskId);
    if (!dragged) return;
    const wasScheduled = Boolean(dragged.reminderTime);

    if (!wasScheduled && targetTaskId === taskId) {
      clearDragState();
      return;
    }

    const patches = computeQueueReorderUpdates({
      draggedTaskId: taskId,
      queueTasks: partition.unscheduledTasks,
      targetTaskId,
      position,
    });

    const feedback = wasScheduled
      ? `تم إزالة «${dragged.title}» من الجدول الزمني.`
      : `تم إعادة ترتيب «${dragged.title}» في قائمة المهام.`;

    commitPatchesWithUndo(patches, feedback);
    if (pickedTaskId === taskId) {
      setPickedTaskId(null);
    }
    clearDragState();
  };

  const moveScheduledTaskStep = (task: TaskItem, direction: -1 | 1) => {
    const slotKey = getSlotHourKey(task.reminderTime);
    if (!slotKey) return;
    const slotTasks = partition.scheduledByHour[slotKey] ?? [];
    const idx = slotTasks.findIndex((t) => t.id === task.id);

    // First reorder inside the same hour slot if a neighbor exists
    const neighborIdx = idx + direction;
    if (idx !== -1 && neighborIdx >= 0 && neighborIdx < slotTasks.length) {
      const neighbor = slotTasks[neighborIdx];
      assignOrReorderInSlot(
        task.id,
        slotKey,
        neighbor.id,
        direction === -1 ? 'before' : 'after',
      );
      return;
    }

    // Otherwise shift to the adjacent hour slot
    const nextTime = shiftTimeByHours(task.reminderTime, direction, 6, 23);
    if (!nextTime) return;
    const nextSlotKey = getSlotHourKey(nextTime);
    if (!nextSlotKey) return;
    const nextSlotTasks = partition.scheduledByHour[nextSlotKey] ?? [];
    const patches = computeSlotReorderUpdates({
      draggedTaskId: task.id,
      slotTasks: nextSlotTasks,
      slotTime24: nextTime,
      selectedDateIso,
      targetTaskId: nextSlotTasks[0]?.id ?? null,
      position: direction === 1 ? 'before' : 'after',
    });
    commitPatchesWithUndo(
      patches,
      `تم نقل «${task.title}» إلى الساعة ${formatReminderTime(nextTime)}.`,
    );
  };

  const handleUndo = () => {
    if (!lastUndo) return;
    batchUpdateTasks(
      lastUndo.snapshots.map((snap) => ({
        id: snap.id,
        patch: {
          dueDate: snap.dueDate,
          reminderTime: snap.reminderTime,
          reminderEnabled: snap.reminderEnabled,
          plannerOrder: snap.plannerOrder,
        },
      })),
    );
    setLastUndo(null);
  };

  const scrollToCurrentHour = () => {
    if (dayTarget !== 'today') {
      setDayTarget('today');
    }
    if (timelineMode !== 'hourly') {
      setTimelineMode('hourly');
    }
    if (currentHour < 8 || currentHour > 20) {
      setHoursRange('full');
    }
    window.requestAnimationFrame(() => {
      const container = timelineScrollRef.current;
      const el = container?.querySelector(`[data-slot-time="${currentHourKey}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    });
  };

  const toggleTaskDone = (task: TaskItem) => {
    updateTask(task.id, {status: task.status === 'خلصت' ? 'لسه' : 'خلصت'});
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
    setPickedTaskId(null);
  };

  const computeDropPosition = (e: React.DragEvent<HTMLElement>): DropPosition => {
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    return e.clientY < midpoint ? 'before' : 'after';
  };

  const handleTaskCardDragOver = (
    e: React.DragEvent<HTMLElement>,
    zone: 'slot' | 'agenda' | 'queue',
    targetTaskId: string,
    slotTime24?: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggingTaskId === targetTaskId) return;
    const position = computeDropPosition(e);
    if (zone === 'slot' && slotTime24) {
      if (dragOverSlot !== slotTime24) setDragOverSlot(slotTime24);
      if (dragOverUnscheduled) setDragOverUnscheduled(false);
    } else if (zone === 'queue') {
      if (!dragOverUnscheduled) setDragOverUnscheduled(true);
      if (dragOverSlot) setDragOverSlot(null);
    }
    setDropIndicator((prev) =>
      prev &&
      prev.zone === zone &&
      prev.targetTaskId === targetTaskId &&
      prev.position === position &&
      prev.slotTime24 === slotTime24
        ? prev
        : {zone, targetTaskId, position, slotTime24},
    );
  };

  const handleSlotTaskDrop = (
    e: React.DragEvent<HTMLElement>,
    slotTime24: string,
    targetTaskId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    if (!taskId) {
      clearDragState();
      return;
    }
    const position = computeDropPosition(e);
    assignOrReorderInSlot(taskId, slotTime24, targetTaskId, position);
  };

  const handleSlotDrop = (e: React.DragEvent, time24: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    if (taskId) {
      assignOrReorderInSlot(taskId, time24, null, 'after');
    } else {
      clearDragState();
    }
  };

  const handleQueueTaskDrop = (
    e: React.DragEvent<HTMLElement>,
    targetTaskId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    if (!taskId) {
      clearDragState();
      return;
    }
    const position = computeDropPosition(e);
    reorderOrUnscheduleInQueue(taskId, targetTaskId, position);
  };

  const handleUnscheduledDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    if (taskId) {
      reorderOrUnscheduleInQueue(taskId, null, 'after');
    } else {
      clearDragState();
    }
  };

  const handleInlineSlotAdd = (e: React.FormEvent, time24: string) => {
    e.preventDefault();
    const clean = slotTaskTitle.trim();
    if (!clean) return;
    addTask({
      title: clean,
      dueDate: selectedDateIso,
      priority: preferences.defaultPriority,
      status: 'لسه',
      tags: slotTaskTags,
      reminderEnabled: true,
      reminderTime: time24,
    });
    setSlotTaskTitle('');
    setSlotTaskTags([]);
    setAddingSlotTime(null);
  };

  const renderScheduledTaskRow = (
    task: TaskItem,
    slotTime24: string,
    slotHour: number,
    zone: 'slot' | 'agenda',
    showTimeInMeta: boolean,
  ) => {
    const isDone = task.status === 'خلصت';
    const isDragging = draggingTaskId === task.id;
    const isPicked = pickedTaskId === task.id;
    const slotTasks = partition.scheduledByHour[slotTime24] ?? [];
    const idxInSlot = slotTasks.findIndex((t) => t.id === task.id);
    const canMoveUp = idxInSlot > 0 || slotHour > 6;
    const canMoveDown = idxInSlot < slotTasks.length - 1 || slotHour < 23;
    const showBeforeLine =
      dropIndicator?.zone === zone &&
      dropIndicator.targetTaskId === task.id &&
      dropIndicator.position === 'before';
    const showAfterLine =
      dropIndicator?.zone === zone &&
      dropIndicator.targetTaskId === task.id &&
      dropIndicator.position === 'after';

    return (
      <div
        key={task.id}
        className="relative"
        onDragOver={(e) => handleTaskCardDragOver(e, zone, task.id, slotTime24)}
        onDrop={(e) => handleSlotTaskDrop(e, slotTime24, task.id)}
      >
        {showBeforeLine && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-1.5 z-10 flex items-center"
          >
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="h-0.5 flex-1 rounded-full bg-accent" />
          </div>
        )}

        <div
          draggable
          onDragStart={(e) => handleDragStart(e, task.id)}
          onDragEnd={clearDragState}
          className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all select-none ${
            isDragging
              ? 'scale-[0.98] border-accent opacity-45'
              : isPicked
                ? 'border-accent bg-accent-soft/40'
                : isDone
                  ? 'border-slate-200/70 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-900/40'
                  : 'border-slate-200/90 bg-slate-50/90 hover:border-accent/60 dark:border-slate-700 dark:bg-slate-900/70'
          }`}
        >
          <span
            aria-hidden="true"
            title="اسحب لإعادة الترتيب أو تغيير الساعة"
            className="cursor-grab text-slate-300 group-hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:group-hover:text-slate-400"
          >
            <GripVertical className="h-4 w-4" />
          </span>

          <button
            type="button"
            onClick={() => toggleTaskDone(task)}
            aria-label={isDone ? `إرجاع ${task.title}` : `تعليم ${task.title} خلصت`}
            className={`flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg transition-colors ${
              isDone
                ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                : 'text-slate-400 hover:bg-white hover:text-accent dark:hover:bg-slate-800'
            }`}
          >
            {isDone ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-xs font-semibold ${
                isDone
                  ? 'text-slate-400 line-through dark:text-slate-500'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {task.title}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              <span className={`font-medium ${priorityTextClass(task.priority)}`}>
                {task.priority}
              </span>
              {task.reminderTime && (showTimeInMeta || task.reminderTime !== slotTime24) && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono">{formatReminderTime(task.reminderTime)}</span>
                </>
              )}
              {(task.tags ?? []).length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="text-accent">
                    {task.tags.map((t) => `#${t}`).join(' · ')}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => moveScheduledTaskStep(task, -1)}
              aria-label={`تحريك ${task.title} لأعلى`}
              title={idxInSlot > 0 ? 'تحريك لأعلى في نفس الساعة' : 'تقديم ساعة'}
              className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-accent disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => moveScheduledTaskStep(task, 1)}
              aria-label={`تحريك ${task.title} لأسفل`}
              title={
                idxInSlot < slotTasks.length - 1 ? 'تحريك لأسفل في نفس الساعة' : 'تأخير ساعة'
              }
              className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-accent disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPickedTaskId((prev) => (prev === task.id ? null : task.id))}
              aria-label={`نقل ${task.title} لساعة تانية`}
              title="نقل لساعة تانية"
              className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-accent dark:hover:bg-slate-800"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => reorderOrUnscheduleInQueue(task.id, null, 'after')}
              aria-label={`إزالة ${task.title} من الجدول الزمني`}
              title="إزالة من الجدول الزمني"
              className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {showAfterLine && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -bottom-1.5 z-10 flex items-center"
          >
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="h-0.5 flex-1 rounded-full bg-accent" />
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="day-planner-heading"
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-800/90"
    >
      {/* Header Row */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
        <div>
          <h2
            id="day-planner-heading"
            className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100"
          >
            <CalendarClock className="h-4 w-4 text-accent" />
            <span>مخطط اليوم</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            اسحب المهام وأفلتها لجدولتها أو إعادة ترتيبها في الجدول الزمني · مجدول{' '}
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              {partition.scheduledCount}
            </span>{' '}
            · منجز{' '}
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {partition.completedScheduledCount}
            </span>{' '}
            · غير مجدول{' '}
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              {partition.unscheduledTasks.length}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeline View Mode: Hourly Vertical Grid vs Focused Vertical Sequence */}
          <div
            role="group"
            aria-label="طريقة عرض الجدول الزمني"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => setTimelineMode('hourly')}
              className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                timelineMode === 'hourly'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              جدول الساعات
            </button>
            <button
              type="button"
              onClick={() => setTimelineMode('agenda')}
              className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                timelineMode === 'agenda'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              المجدول فقط
            </button>
          </div>

          {/* Day Switcher */}
          <div
            role="group"
            aria-label="اختيار اليوم"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => {
                setDayTarget('today');
                setPickedTaskId(null);
                setAddingSlotTime(null);
              }}
              className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                dayTarget === 'today'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              النهارده
            </button>
            <button
              type="button"
              onClick={() => {
                setDayTarget('tomorrow');
                setPickedTaskId(null);
                setAddingSlotTime(null);
              }}
              className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                dayTarget === 'tomorrow'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              بكره
            </button>
          </div>

          {/* Hours Range & Jump to Now (only relevant in hourly mode) */}
          {timelineMode === 'hourly' && (
            <>
              <div
                role="group"
                aria-label="نطاق ساعات الجدول"
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => setHoursRange('workday')}
                  className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                    hoursRange === 'workday'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  ٨ ص – ٨ م
                </button>
                <button
                  type="button"
                  onClick={() => setHoursRange('full')}
                  className={`min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                    hoursRange === 'full'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  اليوم كله
                </button>
              </div>

              <button
                type="button"
                onClick={scrollToCurrentHour}
                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 transition-colors hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Clock className="h-3.5 w-3.5 text-accent" />
                <span>الساعة الآن</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Slim Daily Plan Progress Bar when tasks are scheduled */}
      {partition.scheduledCount > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
            <div
              className="h-full bg-accent transition-all"
              style={{width: `${completionPercent}%`}}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            {completionPercent}% إنجاز الجدول
          </span>
        </div>
      )}

      {/* Undo feedback banner after drag/reorder/reschedule */}
      {lastUndo && !pickedTask && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          <span>{lastUndo.message}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-lg px-2 font-semibold text-accent hover:bg-white dark:hover:bg-slate-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>تراجع</span>
            </button>
            <button
              type="button"
              onClick={() => setLastUndo(null)}
              aria-label="إغلاق الإشعار"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tap-to-place active helper bar (touch/accessibility friendly) */}
      {pickedTask && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100"
        >
          <span>
            اختار الساعة المناسبة للمهمة:{' '}
            <strong className="font-semibold">{pickedTask.title}</strong>
          </span>
          <button
            type="button"
            onClick={() => setPickedTaskId(null)}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2 font-medium text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" />
            <span>إلغاء</span>
          </button>
        </div>
      )}

      {/* Split Workspace: Unscheduled Tasks Queue + Vertical Timeline */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Start Column: Draggable & Reorderable Unscheduled Queue */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!dragOverUnscheduled) setDragOverUnscheduled(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragOverUnscheduled(false);
              setDropIndicator((prev) => (prev?.zone === 'queue' ? null : prev));
            }
          }}
          onDrop={handleUnscheduledDrop}
          className={`flex flex-col rounded-xl border p-3.5 transition-colors lg:col-span-4 ${
            dragOverUnscheduled
              ? 'border-dashed border-accent bg-accent-soft/40'
              : 'border-slate-200/80 bg-slate-50/70 dark:border-slate-700/80 dark:bg-slate-900/50'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5 dark:border-slate-700/70">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              مهام جاهزة للجدولة
            </h3>
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setQueueScope('day')}
                className={`min-h-[26px] whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors ${
                  queueScope === 'day'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {dayTarget === 'today' ? 'اليوم' : 'بكره'}
              </button>
              <button
                type="button"
                onClick={() => setQueueScope('all')}
                className={`min-h-[26px] whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors ${
                  queueScope === 'all'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                كل المفتوحة
              </button>
            </div>
          </div>

          {dragOverUnscheduled && (
            <p className="mt-2 text-center text-xs font-medium text-accent">
              أفلت هنا لإعادة الترتيب أو إزالة وقت المهمة
            </p>
          )}

          {partition.unscheduledTasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {queueScope === 'day'
                  ? `كل مهام ${dayTarget === 'today' ? 'النهارده' : 'بكره'} اتجدولت أو مفيش مهام غير مجدولة.`
                  : 'مفيش مهام مفتوحة غير مجدولة حالياً.'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                تقدر تضيف مهمة مباشرة عند أي ساعة في الجدول الزمني.
              </p>
            </div>
          ) : (
            <div className="mt-2.5 max-h-[420px] space-y-2 overflow-y-auto pe-0.5">
              {partition.unscheduledTasks.map((task) => {
                const isDragging = draggingTaskId === task.id;
                const isPicked = pickedTaskId === task.id;
                const overdue = isTaskOverdue(task, todayIso);
                const showBeforeLine =
                  dropIndicator?.zone === 'queue' &&
                  dropIndicator.targetTaskId === task.id &&
                  dropIndicator.position === 'before';
                const showAfterLine =
                  dropIndicator?.zone === 'queue' &&
                  dropIndicator.targetTaskId === task.id &&
                  dropIndicator.position === 'after';

                return (
                  <div
                    key={task.id}
                    className="relative"
                    onDragOver={(e) => handleTaskCardDragOver(e, 'queue', task.id)}
                    onDrop={(e) => handleQueueTaskDrop(e, task.id)}
                  >
                    {showBeforeLine && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 -top-1.5 z-10 flex items-center"
                      >
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        <span className="h-0.5 flex-1 rounded-full bg-accent" />
                      </div>
                    )}

                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={clearDragState}
                      className={`group flex items-start gap-2 rounded-xl border bg-white p-2.5 transition-all select-none dark:bg-slate-800 ${
                        isDragging
                          ? 'scale-[0.98] border-accent opacity-45'
                          : isPicked
                            ? 'border-accent ring-1 ring-accent'
                            : 'border-slate-200/80 hover:border-accent/50 dark:border-slate-700 dark:hover:border-accent/50'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        title="اسحب للجدول الزمني أو لإعادة الترتيب"
                        className="mt-0.5 cursor-grab text-slate-300 group-hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:group-hover:text-slate-400"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className={`font-medium ${priorityTextClass(task.priority)}`}>
                            {task.priority}
                          </span>
                          {overdue ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-medium text-red-600 dark:text-red-400">
                                متأخرة ({formatFriendlyDate(task.dueDate)})
                              </span>
                            </>
                          ) : task.dueDate && task.dueDate !== selectedDateIso ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{formatFriendlyDate(task.dueDate)}</span>
                            </>
                          ) : !task.dueDate ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>بدون ميعاد</span>
                            </>
                          ) : null}
                          {(task.tags ?? []).length > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-accent">#{task.tags[0]}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (timelineMode === 'agenda') {
                            setTimelineMode('hourly');
                          }
                          setPickedTaskId((prev) => (prev === task.id ? null : task.id));
                        }}
                        aria-label={`جدولة ${task.title} في ساعة`}
                        className={`inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors ${
                          isPicked
                            ? 'bg-accent text-white'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-accent dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>{isPicked ? 'محددة' : 'جدوِل'}</span>
                      </button>
                    </div>

                    {showAfterLine && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 -bottom-1.5 z-10 flex items-center"
                      >
                        <span className="h-2 w-2 rounded-full bg-accent" />
                        <span className="h-0.5 flex-1 rounded-full bg-accent" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* End Column: Vertical Timeline View (Hourly or Focused Scheduled Sequence) */}
        <div className="lg:col-span-8">
          {timelineMode === 'agenda' ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-800/40">
              {partition.orderedScheduledTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    مفيش مهام مجدولة بساعة لـ {dayTarget === 'today' ? 'النهارده' : 'بكره'} لسه.
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    افتح جدول الساعات واسحب أي مهمة للساعة المناسبة أو ضيف مهمة مباشرة.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTimelineMode('hourly')}
                    className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-opacity hover:opacity-95"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span>فتح جدول الساعات</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <span>اسحب أي مهمة فوق أو تحت مهمة تانية لإعادة ترتيب جدولك العمودي</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                      {partition.orderedScheduledTasks.length} مهام
                    </span>
                  </div>
                  <div className="relative space-y-3 ps-5">
                    {/* Continuous Vertical Timeline Rail */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute top-3 bottom-3 start-2 w-px bg-slate-200 dark:bg-slate-700"
                    />
                    {partition.orderedScheduledTasks.map((task) => {
                      const slotKey = getSlotHourKey(task.reminderTime) ?? '09:00';
                      const slotHour = Number(slotKey.slice(0, 2));
                      const isCurrent = dayTarget === 'today' && slotKey === currentHourKey;
                      return (
                        <div key={task.id} className="relative">
                          {/* Timeline Node */}
                          <span
                            aria-hidden="true"
                            className={`absolute -start-[17px] top-4 h-2.5 w-2.5 rounded-full border-2 ${
                              isCurrent
                                ? 'border-amber-500 bg-amber-100 dark:bg-amber-950'
                                : task.status === 'خلصت'
                                  ? 'border-emerald-500 bg-emerald-500'
                                  : 'border-accent bg-white dark:bg-slate-900'
                            }`}
                          />
                          {renderScheduledTaskRow(task, slotKey, slotHour, 'agenda', true)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              ref={timelineScrollRef}
              className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200/80 dark:divide-slate-700/70 dark:border-slate-700/80"
            >
              {baseSlots.map((slot, slotIdx) => {
                const slotTasks = partition.scheduledByHour[slot.time24] ?? [];
                const isCurrentHour = dayTarget === 'today' && slot.time24 === currentHourKey;
                const isDropTarget = dragOverSlot === slot.time24;
                const isAddingHere = addingSlotTime === slot.time24;
                const isFirstSlot = slotIdx === 0;
                const isLastSlot = slotIdx === baseSlots.length - 1;

                return (
                  <div
                    key={slot.time24}
                    data-slot-time={slot.time24}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverSlot !== slot.time24) setDragOverSlot(slot.time24);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDragOverSlot((prev) => (prev === slot.time24 ? null : prev));
                        setDropIndicator((prev) =>
                          prev?.zone === 'slot' && prev.slotTime24 === slot.time24 ? null : prev,
                        );
                      }
                    }}
                    onDrop={(e) => handleSlotDrop(e, slot.time24)}
                    className={`flex items-stretch gap-3 px-3 py-2.5 transition-colors ${
                      isDropTarget
                        ? 'bg-accent-soft/60'
                        : isCurrentHour
                          ? 'bg-amber-50/50 dark:bg-amber-950/20'
                          : 'bg-white hover:bg-slate-50/60 dark:bg-slate-800/40 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    {/* Hour Axis Label */}
                    <div className="flex w-16 shrink-0 flex-col items-start justify-start pt-1 sm:w-20">
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          isCurrentHour
                            ? 'font-bold text-amber-700 dark:text-amber-400'
                            : slotTasks.length > 0
                              ? 'font-semibold text-slate-700 dark:text-slate-200'
                              : 'font-medium text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {slot.label}
                      </span>
                      {isCurrentHour && (
                        <span className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          الآن
                        </span>
                      )}
                    </div>

                    {/* Vertical Timeline Axis & Node */}
                    <div className="relative flex w-4 shrink-0 flex-col items-center">
                      {!isFirstSlot && (
                        <span
                          aria-hidden="true"
                          className="absolute -top-2.5 bottom-1/2 w-px bg-slate-200 dark:bg-slate-700"
                        />
                      )}
                      {!isLastSlot && (
                        <span
                          aria-hidden="true"
                          className="absolute top-3 -bottom-2.5 w-px bg-slate-200 dark:bg-slate-700"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className={`relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 transition-colors ${
                          isDropTarget
                            ? 'border-accent bg-accent'
                            : isCurrentHour
                              ? 'border-amber-500 bg-amber-100 dark:bg-amber-950'
                              : slotTasks.length > 0
                                ? 'border-accent bg-accent/20'
                                : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                        }`}
                      />
                    </div>

                    {/* Slot Content & Reorderable Drop Area */}
                    <div className="min-w-0 flex-1 space-y-2">
                      {slotTasks.map((task) =>
                        renderScheduledTaskRow(task, slot.time24, slot.hour, 'slot', false),
                      )}

                      {/* Inline Quick Add Form inside this hour slot */}
                      {isAddingHere ? (
                        <form
                          onSubmit={(e) => handleInlineSlotAdd(e, slot.time24)}
                          className="space-y-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              value={slotTaskTitle}
                              onChange={(e) => setSlotTaskTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setAddingSlotTime(null);
                                  setSlotTaskTitle('');
                                  setSlotTaskTags([]);
                                }
                              }}
                              placeholder={`مهمة جديدة الساعة ${slot.label}...`}
                              className="min-h-[36px] min-w-[160px] flex-1 rounded-lg border border-accent bg-white px-2.5 text-xs text-slate-900 outline-none dark:bg-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="submit"
                              className="min-h-[36px] rounded-lg bg-accent px-3 text-xs font-semibold text-white"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingSlotTime(null);
                                setSlotTaskTitle('');
                                setSlotTaskTags([]);
                              }}
                              className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                            >
                              إلغاء
                            </button>
                          </div>
                          {slotTaskTags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {slotTaskTags.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() =>
                                    setSlotTaskTags((prev) => prev.filter((t) => t !== tag))
                                  }
                                  className="inline-flex min-h-[26px] items-center gap-1 rounded-md bg-accent px-2 text-white"
                                >
                                  <span>#{tag}</span>
                                  <X className="h-3 w-3" />
                                </button>
                              ))}
                            </div>
                          )}
                          <SmartTagSuggestionsBar
                            suggestions={slotSmartSuggestions}
                            onAcceptTag={handleAcceptSlotTag}
                          />
                        </form>
                      ) : (
                        <div className="flex min-h-[30px] items-center justify-between gap-2">
                          {isDropTarget && !dropIndicator ? (
                            <span className="text-xs font-medium text-accent">
                              أفلت المهمة هنا ({slot.label})
                            </span>
                          ) : pickedTask ? (
                            <button
                              type="button"
                              onClick={() =>
                                assignOrReorderInSlot(pickedTask.id, slot.time24, null, 'after')
                              }
                              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-dashed border-accent bg-accent-soft/40 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>حطها الساعة {slot.label}</span>
                            </button>
                          ) : slotTasks.length === 0 ? (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              وقت متاح
                            </span>
                          ) : (
                            <span />
                          )}

                          {!pickedTask && !isDropTarget && (
                            <button
                              type="button"
                              onClick={() => {
                                setAddingSlotTime(slot.time24);
                                setSlotTaskTitle('');
                                setSlotTaskTags([]);
                              }}
                              aria-label={`إضافة مهمة الساعة ${slot.label}`}
                              className="inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-accent dark:text-slate-500 dark:hover:bg-slate-700/70 dark:hover:text-accent"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">إضافة</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
