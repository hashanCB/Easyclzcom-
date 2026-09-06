import { getStudentWebUrl, getSmsSenderName, getSupportContactPhone, getSmsMode, getStripeMode, getStripeKeysStatus, getTrialDays, getSubscriptionPlans } from '@/app/actions/settings';
import { SettingsForm } from './settings-form';
import { TrialDaysForm } from './trial-days-form';
import { PlansForm } from './plans-form';
import { SmsModeToggle } from './sms-mode-toggle';
import { StripeModeToggle } from './stripe-mode-toggle';
import { StripeKeysForm } from './stripe-keys-form';
import { SmsSenderForm } from './sms-sender-form';
import { SupportPhoneForm } from './support-phone-form';
import { BackupButton } from './backup-button';
import { RestoreButton } from './restore-button';
import { DevResetButton } from './dev-reset-button';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [currentUrl, currentSender, currentSupportPhone, currentMode, currentStripeMode, stripeKeys, currentTrialDays, plans] = await Promise.all([
    getStudentWebUrl(),
    getSmsSenderName(),
    getSupportContactPhone(),
    getSmsMode(),
    getStripeMode(),
    getStripeKeysStatus(),
    getTrialDays(),
    getSubscriptionPlans(),
  ]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global configuration for the Easyclz platform.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Student Portal
        </h2>
        <SettingsForm currentUrl={currentUrl} />
      </div>

      {/* SMS section: mode toggle + sender name, grouped together */}
      <div className="rounded-lg border bg-card divide-y">
        <div className="p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            SMS Mode
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Demo mode uses TextLKDemo (text.lk free sender — no registration needed, limited delivery).
            Switch to Live once you register a sender name in your text.lk account.
          </p>
          <SmsModeToggle currentMode={currentMode} />
        </div>

        <div className="p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            SMS Sender Name <span className="ml-2 text-xs font-normal normal-case text-muted-foreground">(Live mode only)</span>
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Name shown on OTP SMS messages when Live mode is active. Must be pre-registered in your text.lk account. Max 11 characters.
          </p>
          <SmsSenderForm currentSender={currentSender} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stripe Payments Mode
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Test mode uses your Stripe test keys — checkouts only accept test cards, no real money.
          Enter the keys below (from dashboard.stripe.com → Developers → API keys), then switch
          to Live when you are ready to charge teachers.
        </p>
        <StripeModeToggle currentMode={currentStripeMode} />
        <div className="mt-6 border-t pt-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stripe Keys
          </h3>
          <StripeKeysForm statuses={stripeKeys} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Subscription Plans
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          The packages teachers can subscribe to. Price changes apply to all new checkouts
          immediately — teachers already paying keep the price they signed up at. New
          sign-ups get a free trial of the plan they pick (default: Growth).
        </p>
        <PlansForm plans={plans} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Free Trial Length
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          The number of free-trial days new teachers get on sign-up. The teacher app shows
          the countdown and daily reminder from each teacher&apos;s own trial end date.
        </p>
        <TrialDaysForm currentDays={currentTrialDays} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Support Contact Number
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Shown to students as a tap-to-call link when they reach the monthly phone/password change limit.
        </p>
        <SupportPhoneForm currentPhone={currentSupportPhone} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Database Backup
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Download a full snapshot of the database (all teachers, students, payments, etc.)
          as a single JSON file. Keep it somewhere safe. Large datasets may take a moment.
        </p>
        <BackupButton />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Restore / Import
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Import a backup JSON file to recover lost data. Restores in the right order
          (teachers → classes → students → …) and merges by ID, so it&apos;s safe to run again.
        </p>
        <RestoreButton />
      </div>

      {process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('fxbfxfmtmmyuufqqddsu') && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50/40 p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-red-600">
            ⚠ DEV — Reset Database
          </h2>
          <p className="mb-4 text-xs text-red-700/80">
            Wipes all teachers, classes, students, payments, and auth users from the DEV database.
            Use this to start a clean testing session. System settings are kept.
            This button only appears when connected to the DEV project.
          </p>
          <DevResetButton />
        </div>
      )}
    </div>
  );
}
