import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../_lib';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SAFE_FILTER_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

function toSafeLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function normalizeFilterId(value: string | null) {
  const normalized = (value || '').trim();
  if (!normalized) return '';
  if (!SAFE_FILTER_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isFinanceAdmin(actor.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const search = request.nextUrl.searchParams;
    const userId = normalizeFilterId(search.get('userId'));
    const paymentCaseId = normalizeFilterId(search.get('paymentCaseId'));
    const sourceTransactionId = normalizeFilterId(search.get('sourceTransactionId'));
    const limit = toSafeLimit(search.get('limit'));

    if (userId === null || paymentCaseId === null || sourceTransactionId === null) {
      return NextResponse.json({ error: 'Invalid filter format' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    let paymentCasesQuery = supabaseAdmin
      .from('payment_cases')
      .select('id, case_type, status, user_id, amount, currency, reason, external_reference, source_txn_id, hold_txn_id, resolution_txn_id, opened_by, resolved_by, resolved_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    let transactionsQuery = supabaseAdmin
      .from('coin_transactions')
      .select('id, user_id, amount, txn_type, description, created_at, reference_type, reference_id, policy_version, reversal_of_txn_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      paymentCasesQuery = paymentCasesQuery.eq('user_id', userId);
      transactionsQuery = transactionsQuery.eq('user_id', userId);
    }

    if (paymentCaseId) {
      paymentCasesQuery = paymentCasesQuery.eq('id', paymentCaseId);
      transactionsQuery = transactionsQuery
        .eq('reference_type', 'payment_case')
        .eq('reference_id', paymentCaseId);
    }

    if (sourceTransactionId) {
      paymentCasesQuery = paymentCasesQuery.eq('source_txn_id', sourceTransactionId);
      transactionsQuery = transactionsQuery.or(
        `id.eq.${sourceTransactionId},reversal_of_txn_id.eq.${sourceTransactionId},reference_id.eq.${sourceTransactionId}`
      );
    }

    const [{ data: paymentCases, error: paymentCasesError }, { data: transactions, error: transactionsError }] =
      await Promise.all([paymentCasesQuery, transactionsQuery]);

    if (paymentCasesError) {
      throw paymentCasesError;
    }
    if (transactionsError) {
      throw transactionsError;
    }

    return NextResponse.json({
      success: true,
      filter: {
        userId: userId || null,
        paymentCaseId: paymentCaseId || null,
        sourceTransactionId: sourceTransactionId || null,
        limit,
      },
      paymentCases: paymentCases || [],
      coinTransactions: transactions || [],
    });
  } catch (error) {
    console.error('admin-payment-history failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
