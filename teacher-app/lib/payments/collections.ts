// Teacher-side cash handover. Assistants record cash as PENDING collections in
// the cloud `payment_collections` table. The teacher counts the physical money,
// confirms the ones they received (creating the real payments locally, which sync
// up) and rejects any that don't match. Read directly over REST — these rows are
// not part of the local-first sync set.
import { useCallback, useEffect, useState } from 'react';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import type { NewPayment } from '../../db/schema/payments';
import { savePayment } from './hooks';

export interface PaymentCollection {
  id: string;
  teacher_id: string;
  class_id: string;
  created_by_assistant_id: string | null;
  student_id: string;
  student_name: string;
  month: string;
  amount_cents: number;
  payload: NewPayment;
  status: 'pending' | 'confirmed' | 'rejected';
  collected_at: string;
  created_at: string;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function fetchPendingCollections(
  teacherId: string,
  token: string,
): Promise<PaymentCollection[]> {
  if (!teacherId || !token) return [];
  const url =
    `${SUPABASE_URL}/rest/v1/payment_collections` +
    `?teacher_id=eq.${teacherId}&status=eq.pending` +
    `&select=id,teacher_id,class_id,created_by_assistant_id,student_id,student_name,month,amount_cents,payload,status,collected_at,created_at` +
    `&order=collected_at.asc`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

async function patchStatus(id: string, token: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/payment_collections?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Could not update the collection (${res.status}). ${msg.slice(0, 120)}`);
  }
}

// Confirm: record the real payment locally (source of truth, syncs up), then
// flag the collection confirmed. Local-first so a network blip can be retried.
// savePayment() also handles the money gate (confirmIfPending) internally.
export async function confirmCollection(col: PaymentCollection, token: string): Promise<void> {
  savePayment(col.payload);
  await patchStatus(col.id, token, {
    status: 'confirmed',
    resulting_payment_id: col.payload.id,
    reviewed_at: new Date().toISOString(),
  });
}

export async function rejectCollection(col: PaymentCollection, token: string, note?: string): Promise<void> {
  await patchStatus(col.id, token, {
    status: 'rejected',
    review_note: note ?? null,
    reviewed_at: new Date().toISOString(),
  });
}

export function usePendingCollections(teacherId: string, token: string) {
  const [items, setItems] = useState<PaymentCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchPendingCollections(teacherId, token));
    } finally {
      setLoading(false);
    }
  }, [teacherId, token]);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, refresh, setItems };
}
