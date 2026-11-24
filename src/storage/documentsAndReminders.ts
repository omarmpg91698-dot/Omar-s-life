import type {DocumentItem, DocumentReminderLead, OmarsLifeStore} from '../types';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const DOCUMENT_REMINDER_LEAD_DAYS: Record<DocumentReminderLead, number> = {
  month: 30,
  week: 7,
  day: 1,
};

export const DOCUMENT_REMINDER_LEAD_LABELS: Record<DocumentReminderLead, string> = {
  month: 'قبل شهر (٣٠ يوم)',
  week: 'قبل أسبوع (٧ أيام)',
  day: 'قبل يوم (٢٤ ساعة)',
};

export const DOCUMENT_REMINDER_SHORT_LABELS: Record<DocumentReminderLead, string> = {
  month: 'قبل شهر',
  week: 'قبل أسبوع',
  day: 'قبل يوم',
};

export type DocumentExpiryState = 'expired' | 'due_soon' | 'active';

export interface DocumentExpiryInfo {
  daysLeft: number;
  leadDays: number;
  state: DocumentExpiryState;
  isReminderActive: boolean;
  label: string;
}

function parseIsoDateToUtcMidnight(isoDate: string): number | null {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function getDocumentExpiryInfo(
  doc: Pick<DocumentItem, 'expiryDate' | 'reminderLead'>,
  todayIso: string,
): DocumentExpiryInfo {
  const lead: DocumentReminderLead = doc.reminderLead ?? 'month';
  const leadDays = DOCUMENT_REMINDER_LEAD_DAYS[lead] ?? 30;
  const expiryMs = parseIsoDateToUtcMidnight(doc.expiryDate);
  const todayMs = parseIsoDateToUtcMidnight(todayIso);

  if (expiryMs === null || todayMs === null) {
    return {
      daysLeft: 0,
      leadDays,
      state: 'active',
      isReminderActive: false,
      label: doc.expiryDate,
    };
  }

  const daysLeft = Math.round((expiryMs - todayMs) / (24 * 60 * 60 * 1000));

  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      daysLeft,
      leadDays,
      state: 'expired',
      isReminderActive: true,
      label:
        overdueDays === 1
          ? 'منتهية من يوم'
          : overdueDays === 2
            ? 'منتهية من يومين'
            : `منتهية من ${overdueDays} يوم`,
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft: 0,
      leadDays,
      state: 'due_soon',
      isReminderActive: true,
      label: 'تنتهي النهارده',
    };
  }

  const isReminderActive = daysLeft <= leadDays;
  const state: DocumentExpiryState = isReminderActive ? 'due_soon' : 'active';
  const label =
    daysLeft === 1
      ? 'تنتهي بكرة'
      : daysLeft === 2
        ? 'باقي يومين'
        : `باقي ${daysLeft} يوم`;

  return {
    daysLeft,
    leadDays,
    state,
    isReminderActive,
    label,
  };
}

export interface DriveBackupReminderStatus {
  shouldRemind: boolean;
  daysSinceLastSync: number | null;
  neverSynced: boolean;
}

export function evaluateWeeklyDriveBackupReminder(input: {
  lastSyncedAt: number | null;
  store: Pick<OmarsLifeStore, 'tasks' | 'notes' | 'goals' | 'documents'>;
  now?: number;
  snoozedUntil?: number | null;
}): DriveBackupReminderStatus {
  const now = input.now ?? Date.now();
  if (input.snoozedUntil && now < input.snoozedUntil) {
    return {shouldRemind: false, daysSinceLastSync: null, neverSynced: input.lastSyncedAt === null};
  }

  const totalItems =
    input.store.tasks.length +
    input.store.notes.length +
    input.store.goals.length +
    (input.store.documents?.length ?? 0);

  if (totalItems === 0) {
    return {shouldRemind: false, daysSinceLastSync: null, neverSynced: input.lastSyncedAt === null};
  }

  if (input.lastSyncedAt !== null && Number.isFinite(input.lastSyncedAt)) {
    const elapsedMs = Math.max(0, now - input.lastSyncedAt);
    const daysSinceLastSync = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    return {
      shouldRemind: elapsedMs >= SEVEN_DAYS_MS,
      daysSinceLastSync,
      neverSynced: false,
    };
  }

  // Never synced yet: trigger reminder once the user's oldest saved item is at least 7 days old
  const timestamps: number[] = [];
  for (const t of input.store.tasks) timestamps.push(t.createdAt);
  for (const n of input.store.notes) timestamps.push(n.createdAt);
  for (const g of input.store.goals) timestamps.push(g.createdAt);
  for (const d of input.store.documents ?? []) timestamps.push(d.createdAt);

  const oldestCreatedAt = timestamps.length > 0 ? Math.min(...timestamps) : now;
  const elapsedMs = Math.max(0, now - oldestCreatedAt);
  const daysSinceStart = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  return {
    shouldRemind: elapsedMs >= SEVEN_DAYS_MS,
    daysSinceLastSync: daysSinceStart,
    neverSynced: true,
  };
}
