// Mirror of apps/r2-worker/lib/r2-paths.ts — keep in sync.
export const R2Paths = {
  noteFile:     (teacherId: string, noteId: string, filename: string) =>
    `t/${teacherId}/notes/${noteId}/${filename}`,
  studentPhoto: (teacherId: string, studentId: string) =>
    `t/${teacherId}/students/${studentId}/photo`,
  teacherPhoto: (teacherId: string) =>
    `t/${teacherId}/profile/photo`,
  subjectImage: (teacherId: string, classId: string) =>
    `t/${teacherId}/subjects/${classId}/image`,
  // slot: 'q' for the question, or 'o0','o1',… for option images.
  questionImage: (teacherId: string, questionId: string, slot: string) =>
    `t/${teacherId}/questions/${questionId}/${slot}`,
} as const;
