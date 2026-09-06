'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronDown, Maximize2, X } from 'lucide-react';
import { useEnrollments, useGlobalSession, type Enrollment } from '@/lib/auth';
import { Card, CardBody } from '@/components/ui/Card';
import { SuspendedBanner } from '@/components/ui/SuspendedBanner';

function buildQrPayload(studentId: string, cardVersion: number): string {
  // Same format as teacher-app: v1.<studentId>.<cardVersion>.<expUnix>
  // 30-day validity, resets on each login (fresh card_version from server)
  const expUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  return `v1.${studentId}.${cardVersion}.${expUnix}`;
}

// Account QR (v1a.<accountId>.<expUnix>) — works BEFORE joining any class. An
// assistant scans it at the door: the app registers the student into that class
// and collects their first payment in one step. No class code, no waiting.
function buildAccountQrPayload(accountId: string): string {
  const expUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  return `v1a.${accountId}.${expUnix}`;
}

export default function MyQRPage() {
  const enrollments = useEnrollments();
  const global = useGlobalSession();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // Keep selector in sync with global selected
  useEffect(() => {
    if (global) setSelectedIdx(global.selectedIndex ?? 0);
  }, [global]);

  const enrollment: Enrollment | null = enrollments[selectedIdx] ?? enrollments[0] ?? null;
  const payload = enrollment
    ? buildQrPayload(enrollment.student_id, enrollment.card_version ?? 1)
    : null;

  // Not in any class yet → show the ACCOUNT QR. The assistant scans it to
  // register the student into their class and take the first payment in one go.
  if (enrollments.length === 0) {
    const accountId = global?.account?.id ?? null;
    if (!accountId) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-3 text-5xl">🔲</div>
          <p className="font-semibold">No QR available</p>
          <p className="mt-1 text-sm text-muted-foreground">Sign in again to load your QR.</p>
        </div>
      );
    }
    const accountPayload = buildAccountQrPayload(accountId);
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">My QR Card</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Show this to your teacher or assistant to join the class and pay.
          </p>
        </div>
        <Card>
          <CardBody className="flex flex-col items-center py-6">
            <button
              onClick={() => setFullscreen(true)}
              className="relative mb-5 rounded-2xl bg-card p-4 shadow-md transition active:scale-95"
              title="Tap to enlarge"
            >
              <QRCodeSVG value={accountPayload} size={200} bgColor="#ffffff" fgColor="#000000" level="M" />
              <div className="absolute bottom-2 right-2 rounded-full bg-black/10 p-1">
                <Maximize2 className="h-3 w-3 text-black/50" />
              </div>
            </button>
            <p className="text-xl font-bold">{global?.account?.name ?? 'My card'}</p>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
              <span className="text-base leading-none">⏳</span>
              <p>
                <span className="font-semibold">Not in a class yet.</span> Show this QR to your
                teacher or assistant — they scan it to add you and take your first payment.
              </p>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Tap the QR to enlarge · Valid 30 days
            </p>
          </CardBody>
        </Card>

        {fullscreen && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-card" onClick={() => setFullscreen(false)}>
            <button onClick={() => setFullscreen(false)} className="absolute right-4 top-4 rounded-full bg-black/10 p-2">
              <X className="h-5 w-5" />
            </button>
            <QRCodeSVG value={accountPayload} size={280} bgColor="#ffffff" fgColor="#000000" level="M" />
            <p className="mt-6 text-lg font-bold">{global?.account?.name ?? 'My card'}</p>
            <p className="mt-6 text-xs text-muted-foreground">Tap anywhere to close</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">My QR Card</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Show this to your teacher or assistant to mark attendance or collect payment.
          </p>
        </div>

        {/* Suspended warning */}
        {enrollment?.portal_active === false && (
          <SuspendedBanner teacherUsername={enrollment.teacher_username} />
        )}

        {/* Awaiting first payment — student is joined but not yet registered.
            Their teacher/assistant scans this same QR to take the first payment,
            which registers them. */}
        {enrollment?.join_status === 'pending_payment' && (
          <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            <span className="text-base leading-none">⏳</span>
            <p>
              <span className="font-semibold">Almost done.</span> Show this QR to your
              teacher or assistant and make your first payment to finish joining the class.
            </p>
          </div>
        )}

        {/* Class selector when multiple enrollments */}
        {enrollments.length > 1 && (
          <div className="relative">
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="w-full appearance-none rounded-xl border bg-card px-4 py-2.5 pr-10 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {enrollments.map((e, i) => (
                <option key={e.student_id} value={i}>
                  {e.subject} — {e.teacher_username}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}

        {enrollment && payload && (
          <>
            {/* QR Card */}
            <Card>
              <CardBody className="flex flex-col items-center py-6">
                {/* QR code */}
                <button
                  onClick={() => setFullscreen(true)}
                  className="relative mb-5 rounded-2xl bg-card p-4 shadow-md transition active:scale-95"
                  title="Tap to enlarge"
                >
                  <QRCodeSVG
                    value={payload}
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/10 p-1">
                    <Maximize2 className="h-3 w-3 text-black/50" />
                  </div>
                </button>

                {/* Student info */}
                <p className="text-xl font-bold">{enrollment.name}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-primary">{enrollment.student_code}</p>

                <div className="mt-4 w-full divide-y rounded-xl border">
                  {[
                    { label: 'Teacher',  value: enrollment.teacher_username },
                    { label: 'Subject',  value: enrollment.subject },
                    { label: 'Grade',    value: enrollment.grade },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-medium">{r.value || '—'}</span>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Tap the QR to enlarge · Valid 30 days from last login
                </p>
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && enrollment && payload && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-card"
          onClick={() => setFullscreen(false)}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute right-4 top-4 rounded-full bg-black/10 p-2"
          >
            <X className="h-5 w-5" />
          </button>
          <QRCodeSVG
            value={payload}
            size={280}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
          <p className="mt-6 text-lg font-bold">{enrollment.name}</p>
          <p className="mt-1 font-mono text-base font-semibold text-primary">{enrollment.student_code}</p>
          <p className="mt-1 text-sm text-muted-foreground">{enrollment.subject} · {enrollment.teacher_username}</p>
          <p className="mt-6 text-xs text-muted-foreground">Tap anywhere to close</p>
        </div>
      )}
    </>
  );
}
