import { getApkDownloadUrl } from '@/app/actions/website';
import { ApkForm } from './apk-form';

export const dynamic = 'force-dynamic';

export default async function WebsitePage() {
  const apkUrl = await getApkDownloadUrl();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Website</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Settings for the public marketing site (easyclz.com).
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          App Download Link (APK)
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          The Android APK download URL. The “Google Play” button in the easyclz.com hero links
          here so visitors can download the app. Change it any time — the website updates with no
          redeploy. Leave empty to hide the button.
        </p>
        <ApkForm currentUrl={apkUrl} />
      </div>
    </div>
  );
}
