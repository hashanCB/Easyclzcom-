import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const SUPABASE_URL: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? (extra.supabaseUrl as string) ?? '';

export const SUPABASE_ANON_KEY: string =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ?? (extra.supabaseAnonKey as string) ?? '';

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Student portal web app — used in welcome SMS so students know where to join.
export const STUDENT_PORTAL_URL: string =
  (process.env.EXPO_PUBLIC_STUDENT_PORTAL_URL as string) ?? (extra.studentPortalUrl as string) ?? 'https://student.easyclz.com';

export const R2_WORKER_URL: string =
  (process.env.EXPO_PUBLIC_R2_WORKER_URL as string) ?? (extra.r2WorkerUrl as string) ?? 'https://r2-worker-prod.hashan-chanaka96.workers.dev';

export const SECURE_STORE = {
  SESSION: 'teacher_session',
  TEACHER: 'teacher_profile',
  DEVICE_ID: 'device_id',
  ACTIVATED: 'activated',
  THEME: 'theme',
  SUBSCRIPTION: 'subscription',
  LAST_BACKUP: 'last_backup_at',
  // Prefix only — the teacher id is appended: `cloud_pull_done_<teacherId>`.
  // '1' = this device has already pulled the teacher's cloud data; absent/'0'
  // = the initial pull is still pending (show the manual "Pull from cloud"
  // button). Cleared on logout / session expiry / re-activation.
  CLOUD_PULL_DONE: 'cloud_pull_done',
  // Prefix only — the teacher id is appended: `last_cloud_backup_at_<teacherId>`.
  // ISO timestamp of the last successful cloud backup (full push). Persisted so
  // the "Backed up X ago" indicator survives app restarts, and used to schedule
  // a guaranteed daily backup when the app is opened.
  LAST_CLOUD_BACKUP: 'last_cloud_backup_at',
  // Prefix only — the teacher id is appended: `trial_reminder_shown_<teacherId>`.
  // Stores the date (YYYY-MM-DD) the trial reminder was last shown, so the
  // "you're on a trial — upgrade your plan" nudge fires at most once per day.
  TRIAL_REMINDER_SHOWN: 'trial_reminder_shown',
} as const;
