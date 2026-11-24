import type {DocumentItem, GoalProjectItem, NoteItem, TaskItem} from '../types';

export type SearchResultKind = 'task' | 'note' | 'document' | 'goal';
export type SearchFilterKind = 'all' | SearchResultKind;

export interface GlobalSearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  snippet?: string;
  score: number;
  updatedAt: number;
  task?: TaskItem;
  note?: NoteItem;
  document?: DocumentItem;
  goal?: GoalProjectItem;
}

export interface GlobalSearchOutput {
  results: GlobalSearchResult[];
  counts: {
    all: number;
    task: number;
    note: number;
    document: number;
    goal: number;
  };
}

export function normalizeSearchText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Arabic diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function scoreFieldMatch(
  tokens: string[],
  primaryNorm: string,
  secondaryNorm: string,
  metaNorm: string,
): number {
  const combined = `${primaryNorm} ${metaNorm} ${secondaryNorm}`.trim();
  if (!combined) return 0;

  for (const token of tokens) {
    if (!combined.includes(token)) {
      return 0;
    }
  }

  const fullQuery = tokens.join(' ');
  let score = 10;
  if (primaryNorm === fullQuery) {
    score += 100;
  } else if (primaryNorm.startsWith(fullQuery)) {
    score += 70;
  } else if (primaryNorm.includes(fullQuery)) {
    score += 45;
  }

  for (const token of tokens) {
    if (primaryNorm.includes(token)) score += 20;
    else if (metaNorm.includes(token)) score += 12;
    else if (secondaryNorm.includes(token)) score += 6;
  }

  return score;
}

function makeSnippet(text: string, maxLen = 90): string | undefined {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > maxLen ? `${clean.slice(0, maxLen).trim()}…` : clean;
}

export function searchAllLifeItems(
  data: {
    tasks: TaskItem[];
    notes: NoteItem[];
    documents?: DocumentItem[];
    goals: GoalProjectItem[];
  },
  rawQuery: string,
  filter: SearchFilterKind = 'all',
): GlobalSearchOutput {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) {
    return {
      results: [],
      counts: {all: 0, task: 0, note: 0, document: 0, goal: 0},
    };
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const allMatches: GlobalSearchResult[] = [];

  for (const task of data.tasks) {
    const titleNorm = normalizeSearchText(task.title);
    const metaNorm = normalizeSearchText(
      [task.priority, task.status, task.dueDate ?? '', ...(task.tags ?? [])].join(' '),
    );
    const score = scoreFieldMatch(tokens, titleNorm, '', metaNorm);
    if (score > 0) {
      allMatches.push({
        id: task.id,
        kind: 'task',
        title: task.title,
        score: score + (task.status !== 'خلصت' ? 5 : 0),
        updatedAt: task.updatedAt,
        task,
      });
    }
  }

  for (const note of data.notes) {
    const titleNorm = normalizeSearchText(note.title);
    const contentNorm = normalizeSearchText(note.content);
    const metaNorm = normalizeSearchText(note.category);
    const score = scoreFieldMatch(tokens, titleNorm, contentNorm, metaNorm);
    if (score > 0) {
      allMatches.push({
        id: note.id,
        kind: 'note',
        title: note.title,
        snippet: makeSnippet(note.content),
        score,
        updatedAt: note.updatedAt,
        note,
      });
    }
  }

  for (const doc of data.documents ?? []) {
    const titleNorm = normalizeSearchText(doc.title);
    const notesNorm = normalizeSearchText(doc.notes ?? '');
    const metaNorm = normalizeSearchText(
      [doc.category, doc.documentNumber ?? '', doc.expiryDate].join(' '),
    );
    const score = scoreFieldMatch(tokens, titleNorm, notesNorm, metaNorm);
    if (score > 0) {
      allMatches.push({
        id: doc.id,
        kind: 'document',
        title: doc.title,
        snippet: makeSnippet(doc.notes || doc.documentNumber || ''),
        score,
        updatedAt: doc.updatedAt,
        document: doc,
      });
    }
  }

  for (const goal of data.goals) {
    const titleNorm = normalizeSearchText(goal.title);
    const descNorm = normalizeSearchText(goal.description);
    const metaNorm = normalizeSearchText([goal.kind, goal.targetDate ?? ''].join(' '));
    const score = scoreFieldMatch(tokens, titleNorm, descNorm, metaNorm);
    if (score > 0) {
      allMatches.push({
        id: goal.id,
        kind: 'goal',
        title: goal.title,
        snippet: makeSnippet(goal.description),
        score,
        updatedAt: goal.updatedAt,
        goal,
      });
    }
  }

  allMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.updatedAt - a.updatedAt;
  });

  let taskCount = 0;
  let noteCount = 0;
  let documentCount = 0;
  let goalCount = 0;
  for (const item of allMatches) {
    if (item.kind === 'task') taskCount += 1;
    else if (item.kind === 'note') noteCount += 1;
    else if (item.kind === 'document') documentCount += 1;
    else goalCount += 1;
  }

  const filtered =
    filter === 'all' ? allMatches : allMatches.filter((item) => item.kind === filter);

  return {
    results: filtered,
    counts: {
      all: allMatches.length,
      task: taskCount,
      note: noteCount,
      document: documentCount,
      goal: goalCount,
    },
  };
}
