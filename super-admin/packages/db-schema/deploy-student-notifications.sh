#!/usr/bin/env bash
# Deploy the student-notification edge functions.
# Uses --use-api so NO Docker is required (Supabase CLI v2+).
#
#   ./deploy-student-notifications.sh dev    # easyclz-dev
#   ./deploy-student-notifications.sh prod   # production
set -euo pipefail
cd "$(dirname "$0")"

ENV="${1:-}"
case "$ENV" in
  dev)  REF="fxbfxfmtmmyuufqqddsu" ;;
  prod) REF="kesssbvejyeefyaqjobk" ;;
  *) echo "Usage: $0 dev|prod"; exit 1 ;;
esac

FNS=(
  get_student_notifications
  mark_student_notifications_read
  save_student_push_subscription
  dispatch_student_push
)

for fn in "${FNS[@]}"; do
  echo "── Deploying $fn → $ENV ($REF) ──"
  supabase functions deploy "$fn" --project-ref "$REF" --use-api --no-verify-jwt
done

echo "Done. All student-notification functions deployed to $ENV."
