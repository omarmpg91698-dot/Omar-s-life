import {DEFAULT_PREFERENCES, parseAndValidateBackup} from '../storage/localStore';
import type {DocumentItem, GoalProjectItem, NoteItem, OmarsLifeStore, TaskItem} from '../types';

export const DRIVE_SYNC_FILENAME = 'omars-life-sync.json';
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveSyncFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export interface StoreMergeStats {
  addedTasks: number;
  updatedTasks: number;
  addedNotes: number;
  updatedNotes: number;
  addedGoals: number;
  updatedGoals: number;
}

export interface StoreMergeResult {
  merged: OmarsLifeStore;
  stats: StoreMergeStats;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'انتهت صلاحية جلسة Google Drive. سجّل دخولك تاني عشان تكمل المزامنة.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

async function handleDriveResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.error?.message || '';
    } catch {
      detail = '';
    }
    if (res.status === 403) {
      throw new Error(
        detail
          ? `صلاحيات Google Drive غير كافية (${detail}). جرّب تسجل دخول تاني وتوافق على إذن Google Drive.`
          : 'صلاحيات Google Drive غير كافية. جرّب تسجل دخول تاني وتوافق على إذن Google Drive.',
      );
    }
    throw new Error(detail || `حصلت مشكلة في الاتصال بـ Google Drive (كود ${res.status}).`);
  }
  return res;
}

export async function findSyncFile(accessToken: string): Promise<DriveSyncFileMeta | null> {
  const query = `name='${DRIVE_SYNC_FILENAME}' and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    spaces: 'drive',
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: '5',
  });
  const res = await handleDriveResponse(
    await fetch(`${DRIVE_FILES_API}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );
  const data = (await res.json()) as {files?: DriveSyncFileMeta[]};
  const files = data.files ?? [];
  return files.length > 0 ? files[0] : null;
}

export async function downloadSyncFile(
  accessToken: string,
  fileId: string,
): Promise<OmarsLifeStore> {
  const res = await handleDriveResponse(
    await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );
  const rawText = await res.text();
  return parseAndValidateBackup(rawText);
}

export async function uploadSyncFile(
  accessToken: string,
  store: OmarsLifeStore,
  existingFileId?: string | null,
): Promise<DriveSyncFileMeta> {
  const payload = JSON.stringify(store, null, 2);

  if (existingFileId) {
    const res = await handleDriveResponse(
      await fetch(
        `${DRIVE_UPLOAD_API}/${encodeURIComponent(existingFileId)}?uploadType=media&fields=id,name,modifiedTime,size`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: payload,
        },
      ),
    );
    return (await res.json()) as DriveSyncFileMeta;
  }

  const boundary = `omars_life_sync_${Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    name: DRIVE_SYNC_FILENAME,
    mimeType: 'application/json',
    description: "Omar's Life cross-device sync backup file",
  });

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    payload,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await handleDriveResponse(
    await fetch(
      `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,modifiedTime,size`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    ),
  );
  return (await res.json()) as DriveSyncFileMeta;
}

export async function deleteSyncFile(accessToken: string, fileId: string): Promise<void> {
  await handleDriveResponse(
    await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );
}

function mergeByUpdatedAt<T extends {id: string; updatedAt: number; createdAt: number}>(
  localItems: T[],
  remoteItems: T[],
): {items: T[]; addedFromRemote: number; updatedFromRemote: number} {
  const map = new Map<string, T>();
  for (const item of localItems) {
    map.set(item.id, item);
  }

  let addedFromRemote = 0;
  let updatedFromRemote = 0;

  for (const remoteItem of remoteItems) {
    const existing = map.get(remoteItem.id);
    if (!existing) {
      map.set(remoteItem.id, remoteItem);
      addedFromRemote += 1;
    } else if (remoteItem.updatedAt > existing.updatedAt) {
      map.set(remoteItem.id, remoteItem);
      updatedFromRemote += 1;
    }
  }

  const items = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  return {items, addedFromRemote, updatedFromRemote};
}

export function mergeOmarsLifeStores(
  local: OmarsLifeStore,
  remote: OmarsLifeStore,
): StoreMergeResult {
  const tasksMerge = mergeByUpdatedAt<TaskItem>(local.tasks, remote.tasks);
  const notesMerge = mergeByUpdatedAt<NoteItem>(local.notes, remote.notes);
  const documentsMerge = mergeByUpdatedAt<DocumentItem>(
    local.documents ?? [],
    remote.documents ?? [],
  );
  const goalsMerge = mergeByUpdatedAt<GoalProjectItem>(local.goals, remote.goals);
  const habitsMerge = mergeByUpdatedAt(local.habits ?? [], remote.habits ?? []);
  const memoriesMerge = mergeByUpdatedAt(
    local.assistantMemories ?? [],
    remote.assistantMemories ?? [],
  );

  const focusMap = new Map(
    [...(local.focusSessions ?? []), ...(remote.focusSessions ?? [])].map((s) => [s.id, s]),
  );
  const mergedFocusSessions = Array.from(focusMap.values()).sort(
    (a, b) => b.completedAt - a.completedAt,
  );

  const messagesMap = new Map(
    [...(local.assistantMessages ?? []), ...(remote.assistantMessages ?? [])].map((m) => [m.id, m]),
  );
  const mergedMessages = Array.from(messagesMap.values())
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-80);

  const localProfileUpdated = local.assistantProfile?.updatedAt ?? 0;
  const remoteProfileUpdated = remote.assistantProfile?.updatedAt ?? 0;
  const mergedProfile =
    remoteProfileUpdated > localProfileUpdated
      ? remote.assistantProfile
      : local.assistantProfile ?? remote.assistantProfile;

  const localIsEmpty =
    local.tasks.length === 0 &&
    local.notes.length === 0 &&
    (local.documents?.length ?? 0) === 0 &&
    local.goals.length === 0 &&
    (local.habits?.length ?? 0) === 0;
  const remoteHasData =
    remote.tasks.length > 0 ||
    remote.notes.length > 0 ||
    (remote.documents?.length ?? 0) > 0 ||
    remote.goals.length > 0 ||
    (remote.habits?.length ?? 0) > 0;

  const mergedTags = Array.from(
    new Set([
      ...(local.preferences?.taskTags ?? DEFAULT_PREFERENCES.taskTags),
      ...(remote.preferences?.taskTags ?? []),
    ]),
  );

  const basePrefs = localIsEmpty && remoteHasData ? remote.preferences : local.preferences;

  return {
    merged: {
      version: 1,
      tasks: tasksMerge.items,
      notes: notesMerge.items,
      documents: documentsMerge.items,
      goals: goalsMerge.items,
      habits: habitsMerge.items,
      focusSessions: mergedFocusSessions,
      assistantProfile: mergedProfile,
      assistantMemories: memoriesMerge.items,
      assistantMessages: mergedMessages,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...basePrefs,
        taskTags: mergedTags,
      },
    },
    stats: {
      addedTasks: tasksMerge.addedFromRemote,
      updatedTasks: tasksMerge.updatedFromRemote,
      addedNotes: notesMerge.addedFromRemote,
      updatedNotes: notesMerge.updatedFromRemote,
      addedGoals: goalsMerge.addedFromRemote,
      updatedGoals: goalsMerge.updatedFromRemote,
    },
  };
}

export function formatDriveFileSize(sizeStr?: string): string {
  const bytes = Number(sizeStr);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} بايت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} كيلوبايت`;
  return `${(kb / 1024).toFixed(2)} ميجابايت`;
}

export function formatDriveTimestamp(isoOrMs: string | number | null | undefined): string {
  if (!isoOrMs) return '—';
  const date = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
