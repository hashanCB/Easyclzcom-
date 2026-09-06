// Single shape for every error response so the client can branch reliably.

import { corsHeaders } from './cors.ts';

export type ErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'duplicate_token'
  | 'wrong_credentials'
  | 'inactive_teacher'
  | 'pro_required'
  | 'account_locked'
  | 'pro_inactive'
  | 'server_error'
  | 'rate_limited'
  | 'internal';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  duplicate_token: 409,
  wrong_credentials: 401,
  inactive_teacher: 403,
  pro_required: 403,
  account_locked: 429,
  pro_inactive: 403,
  server_error: 500,
  rate_limited: 429,
  internal: 500,
};

export function errorResponse(err: ApiError): Response {
  return new Response(JSON.stringify({ error: err }), {
    status: STATUS[err.code],
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
