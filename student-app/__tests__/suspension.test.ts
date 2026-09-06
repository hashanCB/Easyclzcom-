// Unit tests for the suspend/restore sync logic that keeps the student portal,
// teacher app, and admin site consistent.
//
// Covers:
//   - markEnrollmentSuspended  (instant cache flip when a 403 is hit mid-session)
//   - refreshGlobalSession     (re-fetches live status on load / tab focus)
//   - data fetch helpers       (propagate the `access_suspended` error code)
//
// Mocks fetch + localStorage + window.location so no network/DB is needed.
// Run with:  npm test  (inside apps/student-web)

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// ── Environment + globals (before module import) ────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL      = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string) => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear:      () => { for (const k in store) delete store[k]; },
};

const locationMock = { href: '', reload: vi.fn() };

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', { localStorage: localStorageMock, location: locationMock });

// auth.ts imports React hooks — stub so the module loads in Node.
vi.mock('react', () => ({
  useState: (init: unknown) => [init, vi.fn()],
  useEffect: (fn: () => void) => fn(),
}));

const fetchMock = vi.fn() as Mock;
vi.stubGlobal('fetch', fetchMock);

function mockResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

// ── Import AFTER stubs are in place ─────────────────────────────────────────
import {
  saveGlobalSession,
  getGlobalSession,
  markEnrollmentSuspended,
  refreshGlobalSession,
  type GlobalStudentSession,
  type Enrollment,
} from '../lib/auth';
import { fetchStudentPayments } from '../lib/payments';
import { fetchStudentExams } from '../lib/exams';
import { fetchStudentNotes } from '../lib/notes';
import { syncChat } from '../lib/chat';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACCOUNT = {
  id:           'acc-uuid-1234',
  name:         'Hashan Test',
  phone:        '0716905898',
  avatar_emoji: '🎓',
  avatar_color: 'blue',
};

function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    student_id:       'stu-1',
    teacher_id:       'tch-1',
    teacher_username: 'ishara',
    student_code:     'STU-0001',
    name:             'Maths',
    grade:            '12',
    subject:          'Maths',
    card_version:     1,
    portal_active:    true,
    token:            'old.jwt.token',
    ...overrides,
  };
}

function session(enrollments: Enrollment[], selectedIndex = 0): GlobalStudentSession {
  return { account: ACCOUNT, enrollments, selectedIndex };
}

beforeEach(() => {
  localStorageMock.clear();
  fetchMock.mockReset();
  locationMock.href = '';
  locationMock.reload.mockReset();
});

// =============================================================================
// markEnrollmentSuspended — instant local flip when a data fetch returns 403
// =============================================================================

describe('markEnrollmentSuspended', () => {
  it('returns false when there is no session', () => {
    expect(markEnrollmentSuspended('stu-1')).toBe(false);
  });

  it('flips a matching active enrollment to suspended and returns true', () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1', portal_active: true })]));
    expect(markEnrollmentSuspended('stu-1')).toBe(true);
    expect(getGlobalSession()?.enrollments[0].portal_active).toBe(false);
  });

  it('returns false (no change) when the enrollment is already suspended', () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1', portal_active: false })]));
    expect(markEnrollmentSuspended('stu-1')).toBe(false);
  });

  it('only affects the matching enrollment, leaving others active', () => {
    saveGlobalSession(session([
      enrollment({ student_id: 'stu-1', portal_active: true }),
      enrollment({ student_id: 'stu-2', portal_active: true }),
    ]));
    markEnrollmentSuspended('stu-1');
    const enrollments = getGlobalSession()!.enrollments;
    expect(enrollments.find((e) => e.student_id === 'stu-1')?.portal_active).toBe(false);
    expect(enrollments.find((e) => e.student_id === 'stu-2')?.portal_active).toBe(true);
  });

  it('returns false for an unknown student id', () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1' })]));
    expect(markEnrollmentSuspended('does-not-exist')).toBe(false);
  });
});

// =============================================================================
// refreshGlobalSession — re-sync with the server on load / focus
// =============================================================================

describe('refreshGlobalSession', () => {
  it('returns false when there is no session', async () => {
    expect(await refreshGlobalSession()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detects a suspend (active → suspended) and updates the cache', async () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1', portal_active: true })]));
    fetchMock.mockReturnValue(mockResponse({
      account: ACCOUNT,
      enrollments: [enrollment({ student_id: 'stu-1', portal_active: false, token: 'new.jwt' })],
    }));

    const changed = await refreshGlobalSession();
    expect(changed).toBe(true);
    expect(getGlobalSession()?.enrollments[0].portal_active).toBe(false);
  });

  it('detects a restore (suspended → active) and updates the cache', async () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1', portal_active: false })]));
    fetchMock.mockReturnValue(mockResponse({
      account: ACCOUNT,
      enrollments: [enrollment({ student_id: 'stu-1', portal_active: true, token: 'new.jwt' })],
    }));

    const changed = await refreshGlobalSession();
    expect(changed).toBe(true);
    expect(getGlobalSession()?.enrollments[0].portal_active).toBe(true);
  });

  it('returns false when nothing meaningful changed (ignores rotated token)', async () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1', portal_active: true, token: 'old.jwt' })]));
    fetchMock.mockReturnValue(mockResponse({
      account: ACCOUNT,
      // same status, only the token rotated — must NOT count as a change
      enrollments: [enrollment({ student_id: 'stu-1', portal_active: true, token: 'rotated.jwt' })],
    }));

    expect(await refreshGlobalSession()).toBe(false);
    // cache still updated with the fresh token though
    expect(getGlobalSession()?.enrollments[0].token).toBe('rotated.jwt');
  });

  it('detects a removed enrollment (unlink) as a change', async () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1' })]));
    fetchMock.mockReturnValue(mockResponse({ account: ACCOUNT, enrollments: [] }));

    const changed = await refreshGlobalSession();
    expect(changed).toBe(true);
    expect(getGlobalSession()?.enrollments).toHaveLength(0);
  });

  it('clamps selectedIndex when enrollments shrink', async () => {
    saveGlobalSession(session(
      [enrollment({ student_id: 'stu-1' }), enrollment({ student_id: 'stu-2' })],
      1, // pointing at the second enrollment
    ));
    fetchMock.mockReturnValue(mockResponse({
      account: ACCOUNT,
      enrollments: [enrollment({ student_id: 'stu-1' })], // stu-2 unlinked
    }));

    await refreshGlobalSession();
    expect(getGlobalSession()?.selectedIndex).toBe(0);
  });

  it('clears the session and redirects to login when the account is locked', async () => {
    saveGlobalSession(session([enrollment({ student_id: 'stu-1' })]));
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'account_locked', message: 'deactivated' } },
      false,
      429,
    ));

    const changed = await refreshGlobalSession();
    expect(changed).toBe(false);
    expect(getGlobalSession()).toBeNull();
    expect(locationMock.href).toBe('/login');
  });

  it('keeps the cached session on a network error', async () => {
    const original = session([enrollment({ student_id: 'stu-1', portal_active: true })]);
    saveGlobalSession(original);
    fetchMock.mockRejectedValue(new Error('network down'));

    const changed = await refreshGlobalSession();
    expect(changed).toBe(false);
    expect(getGlobalSession()).toEqual(original);
  });
});

// =============================================================================
// Data fetch helpers — propagate the `access_suspended` error code so the UI
// can swap into the suspended state instead of showing a red error.
// =============================================================================

describe('data fetch helpers propagate access_suspended', () => {
  const suspended403 = () => mockResponse(
    { error: { code: 'access_suspended', message: 'Your portal access for this class has been suspended.' } },
    false,
    403,
  );

  it('fetchStudentPayments attaches the error code', async () => {
    fetchMock.mockReturnValue(suspended403());
    await expect(fetchStudentPayments('tok')).rejects.toMatchObject({ code: 'access_suspended' });
  });

  it('fetchStudentExams attaches the error code', async () => {
    fetchMock.mockReturnValue(suspended403());
    await expect(fetchStudentExams('tok')).rejects.toMatchObject({ code: 'access_suspended' });
  });

  it('fetchStudentNotes attaches the error code', async () => {
    fetchMock.mockReturnValue(suspended403());
    await expect(fetchStudentNotes('tok')).rejects.toMatchObject({ code: 'access_suspended' });
  });

  it('syncChat attaches the error code', async () => {
    fetchMock.mockReturnValue(suspended403());
    await expect(syncChat('tok')).rejects.toMatchObject({ code: 'access_suspended' });
  });

  it('does not set a code on an ordinary failure', async () => {
    fetchMock.mockReturnValue(mockResponse({ error: { message: 'boom' } }, false, 500));
    await expect(fetchStudentPayments('tok')).rejects.toMatchObject({ code: undefined });
  });
});
