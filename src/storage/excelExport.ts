import * as XLSX from 'xlsx';
import {formatReminderTime} from './localStore';
import {isTaskArchived} from './taskArchive';
import type {GoalProjectItem, NoteItem, TaskItem} from '../types';

function formatTimestampAr(ts: number): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

function makeSheetFromRows(
  headers: string[],
  rows: Array<Array<string | number>>,
  colWidths: number[],
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = colWidths.map((wch) => ({wch}));
  sheet['!views'] = [{rightToLeft: true}];
  return sheet;
}

export function buildOmarsLifeWorkbook(data: {
  tasks: TaskItem[];
  notes: NoteItem[];
  goals: GoalProjectItem[];
}): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const tasksSheet = makeSheetFromRows(
    [
      'اسم المهمة',
      'الحالة',
      'الأولوية',
      'تاريخ التنفيذ',
      'التصنيفات',
      'التنبيه',
      'ساعة التنبيه',
      'تاريخ الإنشاء',
    ],
    data.tasks.map((task) => [
      task.title,
      isTaskArchived(task) ? 'خلصت (مؤرشفة)' : task.status,
      task.priority,
      task.dueDate || 'من غير ميعاد',
      (task.tags ?? []).length > 0 ? task.tags.join('، ') : 'من غير تصنيف',
      (task.reminderEnabled ?? true) ? 'مفعّل' : 'مقفول',
      task.reminderTime ? formatReminderTime(task.reminderTime) : '—',
      formatTimestampAr(task.createdAt),
    ]),
    [34, 14, 12, 16, 24, 12, 14, 18],
  );
  XLSX.utils.book_append_sheet(workbook, tasksSheet, 'مهامي');

  const notesSheet = makeSheetFromRows(
    ['عنوان الملاحظة', 'التصنيف', 'المحتوى', 'عدد الصور المرفقة', 'آخر تعديل'],
    data.notes.map((note) => [
      note.title,
      note.category,
      note.content || '—',
      (note.images ?? []).length,
      formatTimestampAr(note.updatedAt),
    ]),
    [28, 16, 48, 18, 18],
  );
  XLSX.utils.book_append_sheet(workbook, notesSheet, 'ملاحظاتي');

  const goalsSheet = makeSheetFromRows(
    ['النوع', 'العنوان', 'الوصف', 'نسبة الإنجاز (%)', 'التاريخ المستهدف', 'آخر تعديل'],
    data.goals.map((goal) => [
      goal.kind,
      goal.title,
      goal.description || '—',
      goal.progress,
      goal.targetDate || 'من غير تاريخ',
      formatTimestampAr(goal.updatedAt),
    ]),
    [12, 28, 42, 18, 18, 18],
  );
  XLSX.utils.book_append_sheet(workbook, goalsSheet, 'أهدافي ومشاريعي');

  const completedTasksCount = data.tasks.filter((t) => t.status === 'خلصت').length;
  const archivedTasksCount = data.tasks.filter((t) => isTaskArchived(t)).length;
  const remainingTasksCount = data.tasks.length - completedTasksCount;
  const summarySheet = makeSheetFromRows(
    ['البند', 'القيمة'],
    [
      ['إجمالي المهام', data.tasks.length],
      ['المهام المنجزة', completedTasksCount],
      ['المهام المؤرشفة', archivedTasksCount],
      ['المهام المتبقية', remainingTasksCount],
      ['إجمالي الملاحظات', data.notes.length],
      ['إجمالي الأهداف والمشاريع', data.goals.length],
      ['تاريخ التصدير', formatTimestampAr(Date.now())],
    ],
    [28, 22],
  );
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'ملخص البيانات');

  return workbook;
}

export function exportOmarsLifeToExcel(data: {
  tasks: TaskItem[];
  notes: NoteItem[];
  goals: GoalProjectItem[];
}): void {
  const workbook = buildOmarsLifeWorkbook(data);
  const buffer = XLSX.write(workbook, {bookType: 'xlsx', type: 'array'}) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `omars-life-export-${dateTag}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
