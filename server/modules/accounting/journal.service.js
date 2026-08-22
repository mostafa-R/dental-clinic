import JournalEntry, { ACCOUNTS } from './journalEntry.model.js';
import ErrorLog from '../site/errorLog/errorLog.model.js';
import { round2 } from '../../constants/accounting.js';
import ApiError from '../../utils/ApiError.js';

export const JOURNAL_ACCOUNTS = ACCOUNTS;

const TOLERANCE = 0.01;

/**
 * BR-BL-05: post a balanced double-entry journal record.
 *
 * Every financial event (payment, refund, expense, drawing) must produce an
 * entry whose debits equal its credits. An unbalanced or malformed entry is
 * REJECTED and logged to the ErrorLog before the error propagates, so the
 * books can never drift silently.
 *
 * @returns the created JournalEntry
 */
export async function postJournalEntry(
  {
    tenant,
    branch,
    date,
    sourceType,
    sourceId,
    sourceModel,
    description = '',
    lines = [],
    userId = null,
  },
  session = null,
) {
  const normalized = lines
    .map((line) => ({
      account: line.account,
      debit: round2(Math.max(Number(line.debit) || 0, 0)),
      credit: round2(Math.max(Number(line.credit) || 0, 0)),
      memo: String(line.memo || '').slice(0, 200),
    }))
    .filter((line) => line.debit > 0 || line.credit > 0);

  const totalDebit = round2(normalized.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(normalized.reduce((sum, line) => sum + line.credit, 0));

  const hasTwoSidedLine = normalized.some(
    (line) => line.debit > 0 && line.credit > 0,
  );
  const unknownAccount = normalized.find((line) => !ACCOUNTS.includes(line.account));
  const unbalanced =
    normalized.length < 2 ||
    hasTwoSidedLine ||
    !!unknownAccount ||
    totalDebit <= 0 ||
    Math.abs(totalDebit - totalCredit) > TOLERANCE;

  if (unbalanced) {
    // BR-BL-05: log every rejected attempt so accountants can investigate —
    // the write uses the same session so it rolls back with the transaction.
    try {
      await ErrorLog.create(
        [
          {
            tenant: tenant ?? null,
            method: 'JOURNAL',
            url: `${sourceType}${sourceId ? `:${sourceId}` : ''}`,
            statusCode: 400,
            message: `Unbalanced journal entry rejected — debit ${totalDebit} vs credit ${totalCredit} (${normalized.length} lines)${
              unknownAccount ? `, unknown account "${unknownAccount.account}"` : ''
            } — ${description}`,
          },
        ],
        ...(session ? [{ session }] : []),
      );
    } catch {
      // Never mask the original validation error with a logging failure.
    }
    throw ApiError.badRequest('Journal entry does not balance (debits must equal credits)');
  }

  const [entry] = await JournalEntry.create(
    [
      {
        tenant: tenant ?? null,
        branch,
        date: date ? new Date(date) : new Date(),
        sourceType,
        sourceId: sourceId ?? null,
        sourceModel: sourceModel ?? null,
        description,
        lines: normalized,
        totalDebit,
        totalCredit,
        createdBy: userId,
      },
    ],
    ...(session ? [{ session }] : []),
  );
  return entry;
}
