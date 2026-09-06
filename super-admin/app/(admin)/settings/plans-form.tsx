'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle } from 'lucide-react';

import {
  updatePlanPriceAction,
  type SubscriptionPlan,
  type UpdateSettingResult,
} from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const initial: UpdateSettingResult = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
}

function PlanRow({ plan }: { plan: SubscriptionPlan }) {
  const [state, formAction] = useFormState(updatePlanPriceAction, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 py-3">
      <input type="hidden" name="code" value={plan.code} />
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium">{plan.name}</p>
        <p className="text-xs text-muted-foreground">
          {plan.max_students == null ? 'Unlimited students' : `Up to ${plan.max_students} students`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">$</span>
        <Input
          name="price"
          type="number"
          step="0.01"
          min={0}
          defaultValue={(plan.price_cents / 100).toString()}
          className="w-24"
          autoComplete="off"
        />
        <span className="text-xs text-muted-foreground">/month</span>
        <SaveButton />
      </div>
      {state.error && (
        <p className="w-full text-xs text-red-600">{state.error}</p>
      )}
      {state.ok && (
        <p className="flex w-full items-center gap-1 text-xs text-emerald-600">
          <CheckCircle className="h-3.5 w-3.5" /> Saved — applies to all new checkouts.
        </p>
      )}
    </form>
  );
}

export function PlansForm({ plans }: { plans: SubscriptionPlan[] }) {
  const active = plans.filter((p) => p.is_active);
  return (
    <div className="divide-y">
      {active.map((plan) => (
        <PlanRow key={plan.code} plan={plan} />
      ))}
      {active.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">
          No plans found — run the subscription_plans database migration first.
        </p>
      )}
    </div>
  );
}
