// tests/edge_functions_test.ts — Deno tests for Edge Function logic
// TRD §B13: Edge Function test suite

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';

// Test that the state machine module exports correctly
Deno.test('state machine exports VALID_TRANSITIONS', async () => {
  // Dynamic import of the shared module
  const mod = await import('../supabase/functions/_shared/state-machine.ts');
  assertExists(mod.VALID_TRANSITIONS);
  assertExists(mod.validateTransition);
});

Deno.test('state machine has all 13 statuses', async () => {
  const { VALID_TRANSITIONS } = await import('../supabase/functions/_shared/state-machine.ts');
  const expectedStatuses = [
    'created', 'assigned', 'accepted', 'in_progress', 'submitted',
    'verified', 'completed', 'rejected', 'correction_required',
    'resubmitted', 'payment_pending', 'paid', 'cancelled',
  ];
  for (const status of expectedStatuses) {
    assertExists(VALID_TRANSITIONS[status], `Missing transition for status: ${status}`);
  }
});

// Test CORS helper
Deno.test('cors headers are correct', async () => {
  const { corsHeaders } = await import('../supabase/functions/_shared/cors.ts');
  assertEquals(corsHeaders['Access-Control-Allow-Origin'], '*');
  assertEquals(corsHeaders['Access-Control-Allow-Headers'], 'authorization, x-client-info, apikey, content-type');
});

Deno.test('handleCors returns Response for OPTIONS', async () => {
  const { handleCors } = await import('../supabase/functions/_shared/cors.ts');
  const req = new Request('http://localhost', { method: 'OPTIONS' });
  const resp = handleCors(req);
  assertEquals(resp instanceof Response, true);
  assertEquals(resp!.status, 200);
});

Deno.test('handleCors returns null for POST', async () => {
  const { handleCors } = await import('../supabase/functions/_shared/cors.ts');
  const req = new Request('http://localhost', { method: 'POST' });
  const resp = handleCors(req);
  assertEquals(resp, null);
});

// Test error/success helpers
Deno.test('jsonError returns correct status', async () => {
  const { jsonError } = await import('../supabase/functions/_shared/cors.ts');
  const resp = jsonError(400, 'Bad request');
  assertEquals(resp.status, 400);
  const body = await resp.json();
  assertEquals(body.error, 'Bad request');
});

Deno.test('jsonOk returns 200', async () => {
  const { jsonOk } = await import('../supabase/functions/_shared/cors.ts');
  const resp = jsonOk({ success: true });
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.success, true);
});
