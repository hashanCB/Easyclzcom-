'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Pencil, Check, X, Lock, MessageSquare } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Avatar, AVATAR_GRADIENTS } from '@/components/ui/Avatar';
import {
  useEnrollments,
  useGlobalSession,
  updateStudentName,
  updateStudentAvatar,
  updateStudentPhoto,
  requestPhoneChange,
  confirmPhoneChange,
  changeStudentPassword,
  requestPasswordResetOtp,
  confirmPasswordReset,
  unlinkClass,
  ApiError,
  type Enrollment,
} from '@/lib/auth';

const AVATAR_EMOJIS = ['🎓','📚','✏️','🚀','⚡️','🔥','🌟','🎯','🏆','🦊','🐼','🐨','🦁','🐯','🦉','🐧','🌸','🌈','🎮','🎧','⚽️','🏀','🎨','💡'];
const AVATAR_COLORS = ['blue','violet','rose','emerald','amber','cyan','orange','pink'];

/**
 * Read an image file and return a downscaled JPEG data URL (square, centre-
 * cropped). Keeps the upload tiny so it fits comfortably on the account row.
 */
function fileToDownscaledDataUrl(file: File, size = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image processing not supported.'));
        // Centre-crop to a square, then draw scaled into the canvas.
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const global      = useGlobalSession();
  const enrollments = useEnrollments();

  if (!global) return null;

  const { account } = global;

  return (
    <div className="space-y-5">

      {/* Account header */}
      <AccountHeader
        name={account.name}
        phone={account.phone}
        emoji={account.avatar_emoji ?? '🎓'}
        color={account.avatar_color ?? 'blue'}
        photo={account.profile_photo ?? null}
        enrollmentCount={enrollments.length}
      />

      {/* Edit profile */}
      <Card>
        <CardBody className="py-2 divide-y">
          <NameEditRow currentName={account.name} />
          <PhoneEditFlow currentPhone={account.phone} />
          <PasswordChangeRow currentPhone={account.phone} />
        </CardBody>
      </Card>

      {/* Enrolled classes */}
      {enrollments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Enrolled Classes
          </p>
          {enrollments.map((e) => (
            <EnrollmentCard key={e.student_id} enrollment={e} />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Contact your teacher to update class details.
      </p>
    </div>
  );
}

// ── Account header with emoji avatar + picker ────────────────────────────────

function AccountHeader({ name, phone, emoji, color, photo, enrollmentCount }: {
  name: string; phone: string; emoji: string; color: string; photo: string | null; enrollmentCount: number;
}) {
  const [open,  setOpen]  = useState(false);
  const [emo,   setEmo]   = useState(emoji);
  const [col,   setCol]   = useState(color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display values reflect what's saved; picker holds the draft.
  const [dispEmoji, setDispEmoji] = useState(emoji);
  const [dispColor, setDispColor] = useState(color);
  const [dispPhoto, setDispPhoto] = useState<string | null>(photo);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const gradient = AVATAR_GRADIENTS[dispColor] ?? AVATAR_GRADIENTS.blue;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await updateStudentAvatar(emo, col);
      setDispEmoji(emo);
      setDispColor(col);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally { setSaving(false); }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    setError(null);
    setPhotoBusy(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      await updateStudentPhoto(dataUrl);
      setDispPhoto(dataUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not upload photo.');
    } finally { setPhotoBusy(false); }
  }

  async function removePhoto() {
    setError(null);
    setPhotoBusy(true);
    try {
      await updateStudentPhoto(null);
      setDispPhoto(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove photo.');
    } finally { setPhotoBusy(false); }
  }

  return (
    <Card>
      <CardBody className="relative overflow-hidden flex flex-col items-center py-6 text-center">
        {/* Faded oversized emoji watermark */}
        <span
          aria-hidden
          className={`pointer-events-none absolute -right-6 -top-8 text-[9rem] leading-none opacity-[0.07] select-none bg-gradient-to-br ${gradient} bg-clip-text text-transparent`}
        >
          {dispEmoji}
        </span>

        <button
          onClick={() => { setEmo(dispEmoji); setCol(dispColor); setError(null); setOpen(true); }}
          className="relative mb-3 rounded-full transition-transform active:scale-95"
          aria-label="Change avatar"
        >
          {dispPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dispPhoto}
              alt={name || 'Profile photo'}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-background shadow"
            />
          ) : (
            <Avatar name={name || 'S'} emoji={dispEmoji} color={dispColor} size="xl" />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-background">
            <Pencil className="h-3 w-3" />
          </span>
        </button>

        <h1 className="text-lg font-bold">{name || '—'}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{phone}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {enrollmentCount} class{enrollmentCount !== 1 ? 'es' : ''} enrolled
        </p>

        {/* Portal connection badge — any logged-in student is by definition connected */}
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Connected to Online Portal
        </span>

        {open && (
          <div className="relative mt-5 w-full space-y-4 rounded-xl border bg-background/80 p-4 text-left backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Choose your avatar</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile photo */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                {dispPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dispPhoto} alt="Profile" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <Avatar name={name || 'S'} emoji={emo} color={col} size="md" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Profile photo</p>
                  <p className="text-xs text-muted-foreground">A real photo shows to your teachers.</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                >
                  {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {dispPhoto ? 'Change photo' : 'Upload photo'}
                </button>
                {dispPhoto && (
                  <button
                    onClick={removePhoto}
                    disabled={photoBusy}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">or pick an emoji avatar</p>

            {/* Live preview */}
            <div className="flex justify-center">
              <Avatar name={name || 'S'} emoji={emo} color={col} size="lg" />
            </div>

            {/* Emoji grid */}
            <div className="grid grid-cols-8 gap-1.5">
              {AVATAR_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmo(e)}
                  className={`flex aspect-square items-center justify-center rounded-lg text-xl transition-colors ${emo === e ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted'}`}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Color swatches */}
            <div className="flex flex-wrap justify-center gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCol(c)}
                  aria-label={c}
                  className={`h-7 w-7 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[c]} transition-transform ${col === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'}`}
                />
              ))}
            </div>

            {error && <p className="text-center text-xs text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </button>
              <button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-xs">Cancel</button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Name edit row ─────────────────────────────────────────────────────────────

function NameEditRow({ currentName }: { currentName: string }) {
  const [editing,     setEditing]     = useState(false);
  const [name,        setName]        = useState(currentName);
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [saved,       setSaved]       = useState(false);
  const [displayName, setDisplayName] = useState(currentName);

  async function save() {
    setError(null);
    if (!name.trim()) { setError('Enter a name.'); return; }
    if (!password)    { setError('Enter your password to confirm.'); return; }
    setLoading(true);
    try {
      await updateStudentName(password, name.trim());
      setDisplayName(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
      setPassword('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally { setLoading(false); }
  }

  function cancel() {
    setEditing(false);
    setName(displayName);
    setPassword('');
    setError(null);
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Name</span>
        {!editing && (
          <div className="flex items-center gap-2">
            <span className="font-medium">{displayName}</span>
            {saved
              ? <Check className="h-3.5 w-3.5 text-green-500" />
              : <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password to confirm"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
            <button onClick={cancel} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phone change: +94 prefix input + auto-send at 9 digits ───────────────────

const RESEND_COOLDOWN = 120;

function PhoneEditFlow({ currentPhone }: { currentPhone: string }) {
  const [step,       setStep]       = useState<'idle' | 'enter' | 'otp' | 'done'>('idle');
  const [digits,     setDigits]     = useState('');   // 9-digit local part after +94
  const [password,   setPassword]   = useState('');
  const [otp,        setOtp]        = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [display,    setDisplay]    = useState(currentPhone);
  const [resendSecs, setResendSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Full E.164 phone derived from the local 9-digit input.
  const fullPhone = '+94' + digits;

  function startCountdown() {
    setResendSecs(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendSecs((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function reset() {
    setStep('idle');
    setDigits('');
    setPassword('');
    setOtp('');
    setError(null);
    setSupportPhone(null);
    setResendSecs(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
      setError(e.message);
      setSupportPhone((e.details?.support_phone as string | undefined) ?? null);
    } else {
      setError(fallback);
      setSupportPhone(null);
    }
  }

  async function sendOtp(phone: string) {
    setError(null);
    setSupportPhone(null);
    if (!password) { setError('Enter your current password.'); return; }
    setLoading(true);
    try {
      await requestPhoneChange(password, phone);
      setStep('otp');
      startCountdown();
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
    } finally { setLoading(false); }
  }

  async function verifyOtp() {
    setError(null);
    setSupportPhone(null);
    if (otp.length !== 6) { setError('Enter the 6-digit code from the SMS.'); return; }
    setLoading(true);
    try {
      await confirmPhoneChange(fullPhone, otp);
      setDisplay(fullPhone);
      setStep('done');
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
    } finally { setLoading(false); }
  }

  function handleDigitsChange(val: string) {
    const d = val.replace(/\D/g, '').slice(0, 9);
    setDigits(d);
    setError(null);
    if (d.length === 9 && password) {
      void sendOtp('+94' + d);
    }
  }

  // ── idle / done ──
  if (step === 'idle' || step === 'done') {
    return (
      <div className="flex items-center justify-between py-3 text-sm">
        <span className="text-muted-foreground">Phone</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">{display}</span>
          {step === 'done'
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <button onClick={() => setStep('enter')} className="text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>}
        </div>
      </div>
    );
  }

  // ── Step 1: enter new number + password ──
  if (step === 'enter') {
    return (
      <div className="py-3 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">Change Phone Number</span>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* +94 prefix input */}
        <div className="flex items-center rounded-lg border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 overflow-hidden">
          <span className="px-3 py-2 text-sm font-semibold text-foreground bg-muted border-r select-none">+94</span>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={9}
            value={digits}
            onChange={(e) => handleDigitsChange(e.target.value)}
            placeholder="711234567"
            autoFocus
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password to confirm"
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Enter your 9-digit number after <span className="font-mono font-semibold">+94</span> — e.g. <span className="font-mono">711234567</span>. Code sends automatically at 9 digits.
        </p>

        {error && (
          <div className="text-xs text-red-600 space-y-0.5">
            <p>{error}</p>
            {supportPhone && (
              <p>
                Call us:{' '}
                <a href={`tel:${supportPhone}`} className="font-semibold underline">
                  {supportPhone}
                </a>
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => sendOtp(fullPhone)}
            disabled={loading || digits.length !== 9}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Send Code
          </button>
          <button onClick={reset} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
        </div>
      </div>
    );
  }

  // ── Step 2: enter OTP ──
  return (
    <div className="py-3 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">Enter Verification Code</span>
        <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <p className="text-xs text-muted-foreground">
        A 6-digit code was sent to <span className="font-semibold text-foreground">{fullPhone}</span>.
      </p>

      <input
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        autoFocus
        className="w-full rounded-lg border bg-background px-3 py-2 text-center text-xl font-mono tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {error && (
        <div className="text-xs text-red-600 space-y-0.5">
          <p>{error}</p>
          {supportPhone && (
            <p>
              Call us:{' '}
              <a href={`tel:${supportPhone}`} className="font-semibold underline">
                {supportPhone}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={verifyOtp}
          disabled={loading || otp.length !== 6}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Confirm
        </button>
        {resendSecs > 0 ? (
          <span className="text-xs text-muted-foreground">
            Resend in {Math.floor(resendSecs / 60)}:{String(resendSecs % 60).padStart(2, '0')}
          </span>
        ) : (
          <button
            onClick={() => { setStep('enter'); setOtp(''); setError(null); setResendSecs(0); }}
            className="rounded-lg border px-3 py-1.5 text-xs"
          >
            Resend
          </button>
        )}
      </div>
    </div>
  );
}

// ── Enrollment card with leave-class action ───────────────────────────────────

function EnrollmentCard({ enrollment: e }: { enrollment: Enrollment }) {
  const [confirming, setConfirming] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [left,       setLeft]       = useState(false);

  const isSuspended = e.portal_active === false;

  async function leaveClass() {
    setError(null);
    setLoading(true);
    try {
      await unlinkClass(e.student_id);
      setLeft(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (left) {
    return (
      <Card>
        <CardBody className="py-4 text-center text-sm text-muted-foreground">
          You have left <span className="font-semibold text-foreground">{e.subject}</span> (
          {e.teacher_username}). Reload the page to see changes.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={isSuspended ? 'opacity-75' : ''}>
      <CardBody className="divide-y py-1">
        {/* Suspension banner */}
        {isSuspended && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-1">
            <span className="mt-0.5 text-amber-500">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-800">Portal access suspended</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your access for this class has been temporarily suspended by your teacher or admin.
                Chat and class features are unavailable. Contact your teacher to restore access.
              </p>
            </div>
          </div>
        )}

        {([
          { label: 'Teacher',    value: e.teacher_username },
          { label: 'Subject',    value: e.subject },
          { label: 'Grade',      value: e.grade },
          { label: 'Student ID', value: e.student_code, mono: true },
          { label: 'Status',     value: isSuspended ? '⏸ Suspended' : '✅ Active', status: true },
        ] as { label: string; value: string; mono?: boolean; status?: boolean }[]).map((r) => (
          <div key={r.label} className="flex items-center justify-between py-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-medium ${r.mono ? 'font-mono text-xs' : ''} ${r.status && isSuspended ? 'text-amber-600' : ''}`}>
              {r.value || '—'}
            </span>
          </div>
        ))}

        {/* Leave class — only when not suspended (can still leave a suspended class) */}
        <div className="py-3">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs text-red-500 hover:text-red-700 underline-offset-2 hover:underline transition-colors"
            >
              Leave this class
            </button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-red-800">
                Leave {e.subject} ({e.teacher_username})?
              </p>
              <p className="text-xs text-red-700">
                Your payment history and exam records will stay. You can re-join anytime using your teacher&apos;s class code.
              </p>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={leaveClass}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 hover:bg-red-700 transition-colors"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Yes, leave class
                </button>
                <button
                  onClick={() => { setConfirming(false); setError(null); }}
                  disabled={loading}
                  className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Password change + forgot password via OTP ─────────────────────────────────

type PwStep = 'idle' | 'change' | 'reset_send' | 'reset_otp' | 'done';

function PasswordChangeRow({ currentPhone }: { currentPhone: string }) {
  const [step,       setStep]       = useState<PwStep>('idle');
  const [current,    setCurrent]    = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [otp,        setOtp]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [resendSecs,   setResendSecs]   = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startCountdown() {
    setResendSecs(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendSecs((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function reset() {
    setStep('idle');
    setCurrent(''); setNewPw(''); setConfirm(''); setOtp('');
    setError(null); setSupportPhone(null); setResendSecs(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function handleApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
      setError(e.message);
      setSupportPhone((e.details?.support_phone as string | undefined) ?? null);
    } else {
      setError(fallback);
      setSupportPhone(null);
    }
  }

  // Change with current password.
  async function changePassword() {
    setError(null); setSupportPhone(null);
    if (!current)          { setError('Enter your current password.'); return; }
    if (newPw.length < 6)  { setError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirm)  { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await changeStudentPassword(current, newPw);
      setStep('done');
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
    } finally { setLoading(false); }
  }

  // Request OTP to reset forgotten password.
  async function sendResetOtp() {
    setError(null); setSupportPhone(null);
    setLoading(true);
    try {
      await requestPasswordResetOtp(currentPhone);
      setStep('reset_otp');
      startCountdown();
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
    } finally { setLoading(false); }
  }

  // Confirm OTP + set new password.
  async function confirmReset() {
    setError(null); setSupportPhone(null);
    if (otp.length !== 6)  { setError('Enter the 6-digit code.'); return; }
    if (newPw.length < 6)  { setError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirm)  { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await confirmPasswordReset(currentPhone, otp, newPw);
      setStep('done');
    } catch (e) {
      handleApiError(e, 'Something went wrong.');
    } finally { setLoading(false); }
  }

  // ── idle / done ──
  if (step === 'idle' || step === 'done') {
    return (
      <div className="flex items-center justify-between py-3 text-sm">
        <span className="text-muted-foreground">Password</span>
        <div className="flex items-center gap-2">
          <span className="font-medium tracking-widest text-muted-foreground">••••••••</span>
          {step === 'done'
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <button onClick={() => setStep('change')} className="text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>}
        </div>
      </div>
    );
  }

  // ── Change with current password ──
  if (step === 'change') {
    return (
      <div className="py-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">Change Password</span>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {[
          { value: current, set: setCurrent, placeholder: 'Current password',              auto: 'current-password' },
          { value: newPw,   set: setNewPw,   placeholder: 'New password (min 6 characters)', auto: 'new-password' },
          { value: confirm, set: setConfirm, placeholder: 'Confirm new password',           auto: 'new-password' },
        ].map(({ value, set, placeholder, auto }) => (
          <div key={placeholder} className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              autoComplete={auto}
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        ))}

        {error && (
          <div className="text-xs text-red-600 space-y-0.5">
            <p>{error}</p>
            {supportPhone && <p>Call us: <a href={`tel:${supportPhone}`} className="font-semibold underline">{supportPhone}</a></p>}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={changePassword}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Change Password
          </button>
          <button onClick={reset} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
        </div>

        <button
          onClick={() => setStep('reset_send')}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          Forgot your password? Reset via SMS
        </button>
      </div>
    );
  }

  // ── Reset: confirm phone → send OTP ──
  if (step === 'reset_send') {
    return (
      <div className="py-3 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">Reset Password via SMS</span>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <p className="text-xs text-muted-foreground">
          A 6-digit code will be sent to your registered number{' '}
          <span className="font-semibold text-foreground">{currentPhone}</span>.
        </p>

        {error && (
          <div className="text-xs text-red-600 space-y-0.5">
            <p>{error}</p>
            {supportPhone && <p>Call us: <a href={`tel:${supportPhone}`} className="font-semibold underline">{supportPhone}</a></p>}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={sendResetOtp}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Send Code
          </button>
          <button onClick={() => setStep('change')} className="rounded-lg border px-3 py-1.5 text-xs">Back</button>
        </div>
      </div>
    );
  }

  // ── Reset: OTP + new password ──
  return (
    <div className="py-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">Reset Password</span>
        <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <p className="text-xs text-muted-foreground">
        Code sent to <span className="font-semibold text-foreground">{currentPhone}</span>. Enter it and choose a new password.
      </p>

      <input
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        autoFocus
        className="w-full rounded-lg border bg-background px-3 py-2 text-center text-xl font-mono tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {[
        { value: newPw,   set: setNewPw,   placeholder: 'New password (min 6 characters)', auto: 'new-password' },
        { value: confirm, set: setConfirm, placeholder: 'Confirm new password',           auto: 'new-password' },
      ].map(({ value, set, placeholder, auto }) => (
        <div key={placeholder} className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            autoComplete={auto}
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      ))}

      {error && (
        <div className="text-xs text-red-600 space-y-0.5">
          <p>{error}</p>
          {supportPhone && <p>Call us: <a href={`tel:${supportPhone}`} className="font-semibold underline">{supportPhone}</a></p>}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={confirmReset}
          disabled={loading || otp.length !== 6}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Reset Password
        </button>
        {resendSecs > 0 ? (
          <span className="text-xs text-muted-foreground">
            Resend in {Math.floor(resendSecs / 60)}:{String(resendSecs % 60).padStart(2, '0')}
          </span>
        ) : (
          <button
            onClick={() => { setStep('reset_send'); setOtp(''); setError(null); setResendSecs(0); }}
            className="rounded-lg border px-3 py-1.5 text-xs"
          >
            Resend
          </button>
        )}
      </div>
    </div>
  );
}
