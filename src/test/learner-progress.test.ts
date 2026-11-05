import { describe, expect, it } from "vitest";
import { learnerSummary, type LessonHistory } from "@/lib/learner-progress";

const lessons = [
  { id: "a", module_id: "m1", open: true, is_published: true },
  { id: "b", module_id: "m1", open: true, is_published: true },
  { id: "c", module_id: "m2", open: true, is_published: true },
  { id: "hidden-free", module_id: "m2", open: true, is_published: false },
  { id: "locked", module_id: "m3", open: false, is_published: true },
];
const h = (lesson_id: string, is_completed = false): LessonHistory => ({ lesson_id, is_completed, first_viewed_at: "2026-11-05T07:00:00Z", last_viewed_at: "2026-11-05T07:10:00Z", completed_at: is_completed ? "2026-11-05T07:11:00Z" : null });

describe("learner progression rules", () => {
  it("starts at zero before the first visit", () => {
    const s = learnerSummary(lessons, [], null);
    expect([s.done, s.total, s.percent, s.status, s.resumeId]).toEqual([0, 3, 0, "Non commencée", "a"]);
  });
  it("first consultation starts the course without completing a lesson", () => {
    const s = learnerSummary(lessons, [h("a")], { last_lesson_id: "a", first_viewed_at: h("a").first_viewed_at });
    expect([s.done, s.percent, s.status]).toEqual([0, 0, "En cours"]);
  });
  it("one completion increases count and percentage to 1/3 and 33", () => {
    const s = learnerSummary(lessons, [h("a", true)], null);
    expect([s.done, s.total, s.percent]).toEqual([1, 3, 33]);
  });
  it("counts completed modules and course completion", () => {
    expect(learnerSummary(lessons, [h("a", true), h("b", true)], null).modulesDone).toBe(1);
    const s = learnerSummary(lessons, [h("a", true), h("b", true), h("c", true)], null);
    expect([s.modulesDone, s.modulesTotal, s.percent, s.status]).toEqual([2, 2, 100, "Terminée"]);
  });
  it("undo preserves the consultation history but removes completion", () => {
    const history = { ...h("a", true), is_completed: false };
    const s = learnerSummary(lessons, [history], null);
    expect([s.done, s.percent, s.status]).toEqual([0, 0, "En cours"]);
    expect(s.history[0]?.completed_at).toBe("2026-11-05T07:11:00Z");
  });
  it("excludes unpublished free lessons, inaccessible lessons and stale completions", () => {
    const s = learnerSummary(lessons, [h("hidden-free", true), h("locked", true), h("removed", true)], null);
    expect([s.done, s.total, s.percent, s.history.length]).toEqual([0, 3, 0, 0]);
  });
  it("resumes last published accessible lesson", () => {
    expect(learnerSummary(lessons, [], { last_lesson_id: "b", first_viewed_at: "2026-11-05" }).resumeId).toBe("b");
  });
  it("falls back to an unfinished accessible lesson after unpublishing the last", () => {
    const s = learnerSummary(lessons, [h("a", true)], { last_lesson_id: "hidden-free", first_viewed_at: "2026-11-05" });
    expect([s.lastLessonId, s.resumeId]).toEqual([null, "b"]);
  });
  it("an empty course is not completed and has no resume target", () => {
    const s = learnerSummary([], [], null);
    expect([s.status, s.percent, s.resumeId]).toEqual(["Non commencée", 0, null]);
  });
});