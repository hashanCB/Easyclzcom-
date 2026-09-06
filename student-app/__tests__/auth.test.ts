// Unit tests for lib/auth.ts — student portal client functions.
// Mocks fetch + localStorage so no network/DB is needed.
// Run with:  npm test  (inside apps/student-web)

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// ── Environment + globals setup (before module import) ──────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL     = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// localStorage mock (auth.ts reads/writes it; Node has no window)
const store: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string) => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear:      () => { for (const k in store) delete store[k]; },
};
vi.stubGlobal('localStorage', localStorageMock);

// auth.ts guards with `typeof window === 'undefined'` — stub window so the
// guard passes and localStorage reads/writes actually execute in Node.
vi.stubGlobal('window', { localStorage: localStorageMock });

// Mock React hooks (auth.ts imports from 'react') so the module can load in Node.
vi.mock('react', () => ({
  useState: (init: unknown) => [init, vi.fn()],
  useEffect: (fn: () => void) => fn(),
}));

// fetch mock
const fetchMock = vi.fn() as Mock;
vi.stubGlobal('fetch', fetchMock);

// ── Helper to build a mock fetch Response ───────────────────────────────────
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
  getGlobalSession,
  saveGlobalSession,
  clearSession,
  isLoggedIn,
  appendEnrollmentToSession,
  loginStudentGlobal,
  updateStudentName,
  updateStudentAvatar,
  requestPhoneChange,
  confirmPhoneChange,
  changeStudentPassword,
  requestPasswordResetOtp,
  confirmPasswordReset,
  linkClassAuthenticated,
  getClassInviteInfo,
  ApiError,
  type GlobalStudentSession,
  type Enrollment,
} from '../lib/auth';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACCOUNT = {
  id:           'acc-uuid-1234',
  name:         'Hashan Test',
  phone:        '0771234567',
  avatar_emoji: '🎓',
  avatar_color: 'blue',
};

const ENROLLMENT: Enrollment = {
  student_id:      'stu-uuid-5678',
  teacher_id:      'tch-uuid-9999',
  teacher_username: 'mr_silva',
  student_code:    'STU-0042',
  name:            'Grade 11 Physics',
  grade:           '11',
  subject:         'Physics',
  card_version:    1,
  token:           'eyJ.test.jwt',
};

const SESSION: GlobalStudentSession = {
  account:       ACCOUNT,
  enrollments:   [ENROLLMENT],
  selectedIndex: 0,
};

// ── Reset state between tests ────────────────────────────────────────────────

beforeEach(() => {
  localStorageMock.clear();
  fetchMock.mockReset();
});

// =============================================================================
// Session helpers
// =============================================================================

describe('getGlobalSession / saveGlobalSession', () => {
  it('returns null when localStorage is empty', () => {
    expect(getGlobalSession()).toBeNull();
  });

  it('round-trips a session object', () => {
    saveGlobalSession(SESSION);
    expect(getGlobalSession()).toEqual(SESSION);
  });

  it('overwrites an existing session', () => {
    saveGlobalSession(SESSION);
    const updated = { ...SESSION, selectedIndex: 1 };
    saveGlobalSession(updated);
    expect(getGlobalSession()?.selectedIndex).toBe(1);
  });

  it('preserves avatar fields on round-trip', () => {
    const withAvatar = {
      ...SESSION,
      account: { ...ACCOUNT, avatar_emoji: '🚀', avatar_color: 'violet' },
    };
    saveGlobalSession(withAvatar);
    expect(getGlobalSession()?.account.avatar_emoji).toBe('🚀');
    expect(getGlobalSession()?.account.avatar_color).toBe('violet');
  });
});

describe('clearSession', () => {
  it('removes session from localStorage', () => {
    saveGlobalSession(SESSION);
    clearSession();
    expect(getGlobalSession()).toBeNull();
  });

  it('is idempotent — does not throw when already empty', () => {
    expect(() => clearSession()).not.toThrow();
  });
});

describe('isLoggedIn', () => {
  it('returns false when no session exists', () => {
    expect(isLoggedIn()).toBe(false);
  });

  it('returns true when session exists', () => {
    saveGlobalSession(SESSION);
    expect(isLoggedIn()).toBe(true);
  });

  it('returns false after clearSession', () => {
    saveGlobalSession(SESSION);
    clearSession();
    expect(isLoggedIn()).toBe(false);
  });
});

describe('appendEnrollmentToSession', () => {
  it('does nothing when no session exists', () => {
    appendEnrollmentToSession(ENROLLMENT); // should not throw
    expect(getGlobalSession()).toBeNull();
  });

  it('adds a new enrollment', () => {
    saveGlobalSession({ ...SESSION, enrollments: [] });
    appendEnrollmentToSession(ENROLLMENT);
    expect(getGlobalSession()?.enrollments).toHaveLength(1);
    expect(getGlobalSession()?.enrollments[0].student_id).toBe(ENROLLMENT.student_id);
  });

  it('does not add a duplicate enrollment', () => {
    saveGlobalSession(SESSION); // already has ENROLLMENT
    appendEnrollmentToSession(ENROLLMENT);
    expect(getGlobalSession()?.enrollments).toHaveLength(1);
  });

  it('appends a second distinct enrollment', () => {
    saveGlobalSession(SESSION);
    const second: Enrollment = { ...ENROLLMENT, student_id: 'stu-other', teacher_id: 'tch-other' };
    appendEnrollmentToSession(second);
    expect(getGlobalSession()?.enrollments).toHaveLength(2);
  });
});

// =============================================================================
// loginStudentGlobal
// =============================================================================

describe('loginStudentGlobal', () => {
  it('posts to student_global_login with phone + password', async () => {
    fetchMock.mockReturnValue(mockResponse({
      account: ACCOUNT,
      enrollments: [ENROLLMENT],
    }));

    await loginStudentGlobal('0771234567', 'secret123');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('student_global_login');
    const body = JSON.parse(opts.body);
    expect(body.phone).toBe('0771234567');
    expect(body.password).toBe('secret123');
  });

  it('saves session to localStorage on success', async () => {
    fetchMock.mockReturnValue(mockResponse({
      account: ACCOUNT,
      enrollments: [ENROLLMENT],
    }));

    const session = await loginStudentGlobal('0771234567', 'secret123');
    expect(session.account.id).toBe(ACCOUNT.id);
    expect(getGlobalSession()?.account.id).toBe(ACCOUNT.id);
    expect(getGlobalSession()?.enrollments).toHaveLength(1);
  });

  it('stores avatar fields from server in session', async () => {
    const accountWithAvatar = { ...ACCOUNT, avatar_emoji: '🦁', avatar_color: 'rose' };
    fetchMock.mockReturnValue(mockResponse({
      account: accountWithAvatar,
      enrollments: [],
    }));
    await loginStudentGlobal('0771234567', 'pw');
    expect(getGlobalSession()?.account.avatar_emoji).toBe('🦁');
    expect(getGlobalSession()?.account.avatar_color).toBe('rose');
  });

  it('throws ApiError on wrong credentials', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'wrong_credentials', message: 'Invalid phone or password.' } },
      false,
    ));

    await expect(loginStudentGlobal('0771234567', 'wrong'))
      .rejects.toMatchObject({ code: 'wrong_credentials', message: 'Invalid phone or password.' });
  });

  it('throws ApiError on account_locked', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'account_locked', message: 'This account has been deactivated.' } },
      false,
    ));

    await expect(loginStudentGlobal('0771234567', 'pw'))
      .rejects.toMatchObject({ code: 'account_locked' });
  });

  it('does not save session on failure', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'wrong_credentials', message: 'Bad credentials' } },
      false,
    ));

    await expect(loginStudentGlobal('bad', 'bad')).rejects.toThrow();
    expect(getGlobalSession()).toBeNull();
  });
});

// =============================================================================
// updateStudentName
// =============================================================================

describe('updateStudentName', () => {
  beforeEach(() => saveGlobalSession(SESSION));

  it('posts correct payload', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await updateStudentName('mypassword', 'New Name');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.account_id).toBe(ACCOUNT.id);
    expect(body.phone).toBe(ACCOUNT.phone);
    expect(body.password).toBe('mypassword');
    expect(body.name).toBe('New Name');
  });

  it('updates the session name on success', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await updateStudentName('pw', 'Updated Name');
    expect(getGlobalSession()?.account.name).toBe('Updated Name');
  });

  it('does not update session on failure', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'wrong_credentials', message: 'Incorrect password.' } },
      false,
    ));
    await expect(updateStudentName('wrong', 'X')).rejects.toThrow();
    expect(getGlobalSession()?.account.name).toBe(ACCOUNT.name); // unchanged
  });

  it('throws ApiError when not signed in', async () => {
    clearSession();
    await expect(updateStudentName('pw', 'X'))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

// =============================================================================
// updateStudentAvatar
// =============================================================================

describe('updateStudentAvatar', () => {
  beforeEach(() => saveGlobalSession(SESSION));

  it('posts emoji and color', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await updateStudentAvatar('🚀', 'violet');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.emoji).toBe('🚀');
    expect(body.color).toBe('violet');
    expect(body.account_id).toBe(ACCOUNT.id);
    expect(body.phone).toBe(ACCOUNT.phone);
  });

  it('updates session avatar fields on success', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await updateStudentAvatar('🦊', 'rose');
    expect(getGlobalSession()?.account.avatar_emoji).toBe('🦊');
    expect(getGlobalSession()?.account.avatar_color).toBe('rose');
  });

  it('does not change other session fields on avatar update', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await updateStudentAvatar('🐼', 'cyan');
    const s = getGlobalSession();
    expect(s?.account.name).toBe(ACCOUNT.name);      // unchanged
    expect(s?.account.phone).toBe(ACCOUNT.phone);    // unchanged
    expect(s?.enrollments).toHaveLength(1);           // unchanged
  });

  it('does not update session on server error', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'server_error', message: 'DB error' } },
      false,
    ));
    await expect(updateStudentAvatar('🔥', 'blue')).rejects.toThrow();
    expect(getGlobalSession()?.account.avatar_emoji).toBe('🎓'); // unchanged
  });

  it('throws ApiError when not signed in', async () => {
    clearSession();
    await expect(updateStudentAvatar('🚀', 'blue'))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

// =============================================================================
// changeStudentPassword
// =============================================================================

describe('changeStudentPassword', () => {
  beforeEach(() => saveGlobalSession(SESSION));

  it('posts correct payload to change_student_password', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await changeStudentPassword('OldPass1', 'NewPass2');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.current_password).toBe('OldPass1');
    expect(body.new_password).toBe('NewPass2');
    expect(body.account_id).toBe(ACCOUNT.id);
    expect(body.phone).toBe(ACCOUNT.phone);
  });

  it('throws ApiError on wrong current password', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'wrong_credentials', message: 'Current password is incorrect.' } },
      false,
    ));
    await expect(changeStudentPassword('wrong', 'new'))
      .rejects.toMatchObject({ code: 'wrong_credentials' });
  });

  it('throws rate_limited error on 3rd attempt in month', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'rate_limited', message: 'You have already changed your password 2 times this month.' } },
      false,
    ));
    await expect(changeStudentPassword('pw', 'new'))
      .rejects.toMatchObject({ code: 'rate_limited' });
  });

  // ── Feature: rate_limited includes support phone in details ─────────────────
  it('forwards support_phone from rate_limited error details', async () => {
    fetchMock.mockReturnValue(mockResponse(
      {
        error: {
          code: 'rate_limited',
          message: 'You have already changed your password 2 times this month, or contact us for help.',
          details: { support_phone: '0776465456' },
        },
      },
      false,
      429,
    ));

    try {
      await changeStudentPassword('pw', 'new');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe('rate_limited');
      expect(err.details?.support_phone).toBe('0776465456');
    }
  });

  it('has undefined details when rate_limited carries no details field', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'rate_limited', message: 'Too many attempts.' } },
      false,
      429,
    ));

    try {
      await changeStudentPassword('pw', 'new');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).details).toBeUndefined();
    }
  });

  it('throws ApiError when not signed in', async () => {
    clearSession();
    await expect(changeStudentPassword('old', 'new'))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

// =============================================================================
// requestPhoneChange
// =============================================================================

describe('requestPhoneChange', () => {
  beforeEach(() => saveGlobalSession(SESSION));

  it('posts correct payload to request_phone_change', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await requestPhoneChange('password123', '0716905898');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.password).toBe('password123');
    expect(body.new_phone).toBe('0716905898');
    expect(body.account_id).toBe(ACCOUNT.id);
    expect(body.phone).toBe(ACCOUNT.phone);
  });

  it('sends session phone exactly as stored (edge fn normalises)', async () => {
    // Session phone is local format — client must NOT alter it
    const sessionWithIntlPhone = {
      ...SESSION,
      account: { ...ACCOUNT, phone: '0771234567' },
    };
    saveGlobalSession(sessionWithIntlPhone);
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await requestPhoneChange('pw', '0719999999');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe('0771234567'); // passed through unchanged
  });

  it('throws on rate_limited response', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'rate_limited', message: 'Already changed 2 times this month.' } },
      false,
    ));
    await expect(requestPhoneChange('pw', '0711111111'))
      .rejects.toMatchObject({ code: 'rate_limited' });
  });

  // ── Feature: rate_limited includes support phone in details ─────────────────
  it('forwards support_phone from rate_limited error details', async () => {
    fetchMock.mockReturnValue(mockResponse(
      {
        error: {
          code: 'rate_limited',
          message: 'You have already changed your phone number 2 times this month, or contact us for help.',
          details: { support_phone: '0776465456' },
        },
      },
      false,
      429,
    ));

    try {
      await requestPhoneChange('pw', '0711111111');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe('rate_limited');
      expect(err.details?.support_phone).toBe('0776465456');
    }
  });

  it('has undefined details when rate_limited carries no details field', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'rate_limited', message: 'Too many attempts.' } },
      false,
      429,
    ));

    try {
      await requestPhoneChange('pw', '0711111111');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).details).toBeUndefined();
    }
  });

  it('throws on conflict (number already taken)', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'conflict', message: 'Already registered to another account.' } },
      false,
    ));
    await expect(requestPhoneChange('pw', '0711111111'))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('throws ApiError when not signed in', async () => {
    clearSession();
    await expect(requestPhoneChange('pw', '0711111111'))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

// =============================================================================
// confirmPhoneChange
// =============================================================================

describe('confirmPhoneChange', () => {
  beforeEach(() => saveGlobalSession(SESSION));

  it('posts correct payload to confirm_phone_change', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true, new_phone: '0716905898' }));
    await confirmPhoneChange('0716905898', '123456');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.new_phone).toBe('0716905898');
    expect(body.otp).toBe('123456');
    expect(body.account_id).toBe(ACCOUNT.id);
    expect(body.phone).toBe(ACCOUNT.phone);
  });

  it('updates session phone on success', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true, new_phone: '0716905898' }));
    await confirmPhoneChange('0716905898', '123456');
    expect(getGlobalSession()?.account.phone).toBe('0716905898');
  });

  it('keeps other session fields intact after phone change', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true, new_phone: '0716905898' }));
    await confirmPhoneChange('0716905898', '123456');
    const s = getGlobalSession();
    expect(s?.account.name).toBe(ACCOUNT.name);         // unchanged
    expect(s?.account.avatar_emoji).toBe(ACCOUNT.avatar_emoji); // unchanged
    expect(s?.enrollments).toHaveLength(1);              // unchanged
  });

  it('does not update phone on incorrect OTP', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'wrong_credentials', message: 'Incorrect verification code.' } },
      false,
    ));
    await expect(confirmPhoneChange('0716905898', '000000')).rejects.toThrow();
    expect(getGlobalSession()?.account.phone).toBe(ACCOUNT.phone); // unchanged
  });

  it('throws on expired OTP', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'not_found', message: 'Verification code expired.' } },
      false,
    ));
    await expect(confirmPhoneChange('0716905898', '123456'))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws ApiError when not signed in', async () => {
    clearSession();
    await expect(confirmPhoneChange('0711111111', '123456'))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

// =============================================================================
// requestPasswordResetOtp (no session needed — forgot password flow)
// =============================================================================

describe('requestPasswordResetOtp', () => {
  it('posts phone to request_password_reset_otp', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await requestPasswordResetOtp('0771234567');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('request_password_reset_otp');
    const body = JSON.parse(opts.body);
    expect(body.phone).toBe('0771234567');
  });

  // ── Feature: phone normalisation fix — client sends phone as-is ─────────────
  // The edge function now normalises +94... → 07... on the server side.
  // The client must send whatever is in the session (no client-side conversion).
  it('sends +94 format phone as-is (edge fn normalises on server)', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await requestPasswordResetOtp('+94771234567');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe('+94771234567'); // client sends it unchanged
  });

  it('sends local format phone as-is', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await requestPasswordResetOtp('0771234567');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe('0771234567');
  });

  it('succeeds even when phone does not exist (anti-enumeration)', async () => {
    // Server always returns ok:true regardless — test that client doesn't throw
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await expect(requestPasswordResetOtp('0700000000')).resolves.toBeUndefined();
  });

  it('throws on rate_limited (60s cooldown)', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'rate_limited', message: 'Please wait 45 seconds.' } },
      false,
    ));
    await expect(requestPasswordResetOtp('0771234567'))
      .rejects.toMatchObject({ code: 'rate_limited' });
  });
});

// =============================================================================
// confirmPasswordReset
// =============================================================================

describe('confirmPasswordReset', () => {
  it('posts phone + otp + new_password', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await confirmPasswordReset('0771234567', '654321', 'NewPass99');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe('0771234567');
    expect(body.otp).toBe('654321');
    expect(body.new_password).toBe('NewPass99');
  });

  it('sends +94 format phone as-is (edge fn normalises)', async () => {
    fetchMock.mockReturnValue(mockResponse({ ok: true }));
    await confirmPasswordReset('+94771234567', '654321', 'NewPass99');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe('+94771234567');
  });

  it('throws on wrong OTP', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'wrong_credentials', message: 'Incorrect verification code.' } },
      false,
    ));
    await expect(confirmPasswordReset('0771234567', '000000', 'pw'))
      .rejects.toMatchObject({ code: 'wrong_credentials' });
  });

  it('throws when code expired', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'not_found', message: 'Code expired.' } },
      false,
    ));
    await expect(confirmPasswordReset('0771234567', '123456', 'pw'))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws on invalid_input (short password)', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'invalid_input', message: 'Invalid input' } },
      false,
      400,
    ));
    await expect(confirmPasswordReset('0771234567', '123456', 'pw'))
      .rejects.toMatchObject({ code: 'invalid_input' });
  });
});

// =============================================================================
// linkClassAuthenticated
// =============================================================================

describe('linkClassAuthenticated', () => {
  beforeEach(() => saveGlobalSession(SESSION));

  it('posts token + account + phone (phone auto-match, no student_code)', async () => {
    fetchMock.mockReturnValue(mockResponse({
      teacher_username: 'mr_silva',
      student_code: 'STU-0042',
      enrollment_token: 'jwt.tok',
      student: { id: 'stu-1', name: 'Physics G11', grade: '11', subject: 'Physics', card_version: 1, teacher_id: 'tch-1' },
    }));

    await linkClassAuthenticated('invite-token-abc');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.token).toBe('invite-token-abc');
    expect(body.account_id).toBe(ACCOUNT.id);
    expect(body.phone).toBe(ACCOUNT.phone);
    expect(body.student_code).toBeUndefined(); // not sent when auto-matching
  });

  it('includes student_code when provided as fallback', async () => {
    fetchMock.mockReturnValue(mockResponse({
      teacher_username: 'mr_silva',
      student_code: 'STU-0042',
      enrollment_token: 'jwt.tok',
      student: { id: 'stu-1', name: 'Physics G11', grade: '11', subject: 'Physics', card_version: 1, teacher_id: 'tch-1' },
    }));

    await linkClassAuthenticated('invite-token-abc', 'STU-0042');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.student_code).toBe('STU-0042');
  });

  it('throws phone_not_found when server returns it', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'not_found', message: 'phone_not_found' } },
      false,
    ));
    await expect(linkClassAuthenticated('token'))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws ApiError when not signed in', async () => {
    clearSession();
    await expect(linkClassAuthenticated('token'))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

// =============================================================================
// getClassInviteInfo
// =============================================================================

describe('getClassInviteInfo', () => {
  it('posts token and returns class info', async () => {
    const classInfo = {
      teacher_username: 'mr_silva',
      subject: 'Physics',
      grade: '11',
      batch: 'A',
      class_type: 'Theory',
      language: 'English',
      monthly_fee_cents: 250000,
    };
    fetchMock.mockReturnValue(mockResponse(classInfo));

    const result = await getClassInviteInfo('abc-token');
    expect(result.teacher_username).toBe('mr_silva');
    expect(result.subject).toBe('Physics');
    expect(result.monthly_fee_cents).toBe(250000);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.token).toBe('abc-token');
  });

  it('throws on invalid token', async () => {
    fetchMock.mockReturnValue(mockResponse(
      { error: { code: 'not_found', message: 'Invalid class link.' } },
      false,
    ));
    await expect(getClassInviteInfo('bad-token'))
      .rejects.toMatchObject({ code: 'not_found' });
  });
});

// =============================================================================
// ApiError — including new `details` field (Feature: support_phone in errors)
// =============================================================================

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const e = new ApiError('rate_limited', 'Too many attempts');
    expect(e).toBeInstanceOf(Error);
  });

  it('exposes code and message', () => {
    const e = new ApiError('conflict', 'Phone already taken');
    expect(e.code).toBe('conflict');
    expect(e.message).toBe('Phone already taken');
  });

  it('can be caught as ApiError with instanceof', () => {
    const err = new ApiError('server_error', 'Oops');
    expect(err instanceof ApiError).toBe(true);
  });

  // ── Feature: ApiError now carries optional details for support_phone etc. ───
  it('stores details when provided', () => {
    const e = new ApiError('rate_limited', 'Too many changes', { support_phone: '0776465456' });
    expect(e.details).toEqual({ support_phone: '0776465456' });
  });

  it('details is undefined when not provided', () => {
    const e = new ApiError('internal', 'Something went wrong');
    expect(e.details).toBeUndefined();
  });

  it('details can carry arbitrary shape', () => {
    const details = { support_phone: '0776465456', retry_after: 60, extra: { nested: true } };
    const e = new ApiError('rate_limited', 'Wait', details);
    expect(e.details?.support_phone).toBe('0776465456');
    expect((e.details as typeof details).retry_after).toBe(60);
  });

  it('exposes support_phone through details.support_phone', () => {
    const e = new ApiError('rate_limited', 'Limited', { support_phone: '0770000001' });
    const phone = (e.details?.support_phone as string | undefined);
    expect(phone).toBe('0770000001');
  });

  it('name is ApiError', () => {
    const e = new ApiError('not_found', 'Not found');
    expect(e.name).toBe('ApiError');
  });
});
