import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — Easyclz' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-6 text-gray-700">
      <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mt-1 text-xs text-gray-400">Last updated: 12 June 2026</p>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">What we collect</h2>
          <p className="mt-2">
            Easyclz stores the information teachers and students enter to run their classes:
            names, phone numbers, class details, attendance records, exam marks, payment
            records, and messages sent through the app. Students who create a portal account
            also set a password, which is stored encrypted.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">How we use it</h2>
          <p className="mt-2">
            Data is used only to provide the service: showing teachers their class records,
            showing students their own attendance, marks and payments, and sending SMS
            notifications (for example sign-up codes and payment receipts). We do not sell
            personal data or share it with advertisers.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Who can see your data</h2>
          <p className="mt-2">
            A student&apos;s records are visible to that student and to the teacher whose class
            they belong to. Teachers can only see their own classes. Our service providers
            process data on our behalf: Supabase (database hosting), Stripe (subscription
            payments — card details never touch our servers), and our SMS gateway (message
            delivery).
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">How long we keep it</h2>
          <p className="mt-2">
            Data is kept while the account is active. If a teacher or student asks us to
            delete their account, we remove their personal data within 30 days, except
            records we must keep for legal or accounting reasons.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Your choices</h2>
          <p className="mt-2">
            You can ask to see, correct, or delete the data we hold about you. Students can
            leave a class at any time from their profile page. Contact us for any request.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Contact</h2>
          <p className="mt-2">
            Questions about this policy: phone/WhatsApp <strong>077 646 5456</strong>.
          </p>
        </div>
      </section>

      <p className="mt-10 text-xs text-gray-400">
        <Link href="/" className="underline">Home</Link>
        {' · '}
        <Link href="/terms" className="underline">Terms of Service</Link>
      </p>
    </main>
  );
}
