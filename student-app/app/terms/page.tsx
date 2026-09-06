import Link from 'next/link';

export const metadata = { title: 'Terms of Service — Easyclz' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-6 text-gray-700">
      <h1 className="text-2xl font-bold text-gray-900">Terms of Service</h1>
      <p className="mt-1 text-xs text-gray-400">Last updated: 12 June 2026</p>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">The service</h2>
          <p className="mt-2">
            Easyclz helps private teachers manage classes — students, attendance, payments,
            exams and SMS — and gives students a portal to see their own records. By creating
            an account you agree to these terms.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Accounts</h2>
          <p className="mt-2">
            You must give accurate information (your real name and a phone number you own)
            and keep your password safe. Teachers are responsible for the accuracy of the
            class records they keep. One teacher account works on one phone at a time.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Subscriptions and payments</h2>
          <p className="mt-2">
            New teacher accounts get a free trial. After that, a paid monthly plan is needed
            to keep using paid features. Plans are billed monthly through Stripe and can be
            cancelled anytime — the plan stays active until the end of the period already
            paid for. Payments teachers record for their own students are between the teacher
            and the student; Easyclz only keeps the record.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Acceptable use</h2>
          <p className="mt-2">
            Don&apos;t use Easyclz to send spam, store unlawful content, or access other
            people&apos;s data. We may suspend accounts that abuse the service or harm other
            users.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Service and liability</h2>
          <p className="mt-2">
            We work to keep the service available and your data safe, including regular
            backups, but the service is provided &quot;as is&quot; — we cannot promise it will
            never be interrupted. Our liability is limited to the amount you paid us in the
            last 3 months.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Changes</h2>
          <p className="mt-2">
            We may update these terms as the service grows. Big changes will be announced in
            the app. Continuing to use Easyclz after a change means you accept the new terms.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Contact</h2>
          <p className="mt-2">
            Questions: phone/WhatsApp <strong>077 646 5456</strong>.
          </p>
        </div>
      </section>

      <p className="mt-10 text-xs text-gray-400">
        <Link href="/" className="underline">Home</Link>
        {' · '}
        <Link href="/privacy" className="underline">Privacy Policy</Link>
      </p>
    </main>
  );
}
