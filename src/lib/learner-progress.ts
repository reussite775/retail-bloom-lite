import { progressStats, resumeLesson } from "@/lib/learner-access";

export type ProgressLesson = { id: string; module_id: string; open: boolean; is_published?: boolean };
export type LessonHistory = { lesson_id: string; is_completed: boolean; first_viewed_at: string | null; last_viewed_at: string | null; completed_at: string | null };

export function learnerSummary(lessons: ProgressLesson[], history: LessonHistory[], state: { last_lesson_id: string | null; first_viewed_at: string | null } | null) {
  const accessible = lessons.filter((l) => l.open && l.is_published !== false);
  const ids = new Set(accessible.map((l) => l.id));
  const validHistory = history.filter((h) => ids.has(h.lesson_id));
  const completed = validHistory.filter((h) => h.is_completed).map((h) => h.lesson_id);
  const stats = progressStats(accessible, new Set(completed));
  const lastLessonId = state?.last_lesson_id && ids.has(state.last_lesson_id) ? state.last_lesson_id : null;
  const started = !!state?.first_viewed_at || validHistory.some((h) => h.first_viewed_at || h.is_completed);
  const status = stats.total > 0 && stats.done === stats.total ? "Terminée" : started ? "En cours" : "Non commencée";
  return { ...stats, completed, history: validHistory, lastLessonId, resumeId: resumeLesson(accessible, lastLessonId, new Set(completed)), status, action: status === "Terminée" ? "Revoir la formation" : started ? "Reprendre ma formation" : "Commencer la formation" };
}