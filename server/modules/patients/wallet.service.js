import Wallet from './wallet.model.js';
import ApiError from '../../utils/ApiError.js';
import { withTransaction } from '../../core/transaction.js';
import { round2 } from '../../constants/accounting.js';

/**
 * Find or create a wallet for a patient.
 * Uses upsert with duplicate-key race handling.
 * PRD §6.3: one wallet per patient per branch — the lookup is keyed on the
 * compound {patient, branch} so a branch reassignment opens a fresh wallet.
 */
export async function getOrCreateWallet(patient) {
  const key = { patient: patient._id, branch: patient.branch };
  let wallet = await Wallet.findOne(key);
  if (!wallet) {
    try {
      wallet = await Wallet.findOneAndUpdate(
        key,
        {
          $setOnInsert: {
            branch: patient.branch,
            tenant: patient.tenant,
            patient: patient._id,
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
    } catch (err) {
      if (err.code === 11000) {
        wallet = await Wallet.findOne(key);
      } else {
        throw err;
      }
    }
  }
  return wallet;
}

/**
 * Add a wallet transaction. Uses atomic $inc for balance updates to prevent
 * race conditions. Optionally reuses an external session (for callers already
 * inside a withTransaction block).
 *
 * @param {Object} patient - Patient document (must have _id, branch, tenant)
 * @param {Object} data - { type, amount, reference, description, invoice, installment }
 * @param {string} userId - User performing the action
 * @param {ClientSession} [externalSession] - Optional external session to reuse
 */
export async function addTransaction(patient, data, userId, externalSession = null) {
  const fn = async (session) => {
    // Round to cents so the wallet balance can never diverge from the
    // round2 amounts stored on installments/invoices (penny drift).
    const amount = round2(Math.abs(Number(data.amount)));
    if (amount <= 0) {
      throw ApiError.badRequest('Amount must be positive');
    }

    // PRD §6.3: wallets are keyed per patient per branch.
    const walletKey = { patient: patient._id, branch: patient.branch };
    let wallet = await Wallet.findOne(walletKey).session(session);
    if (!wallet) {
      try {
        wallet = await Wallet.findOneAndUpdate(
          walletKey,
          {
            $setOnInsert: {
              branch: patient.branch,
              tenant: patient.tenant,
              patient: patient._id,
            },
          },
          { upsert: true, returnDocument: "after", runValidators: true, session },
        );
      } catch (err) {
        if (err.code === 11000) {
          wallet = await Wallet.findOne(walletKey).session(session);
        } else {
          throw err;
        }
      }
    }

    // Atomic balance check + update using $inc
    if (data.type === 'debit') {
      const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { returnDocument: "after", session },
      );
      if (!updated) {
        throw ApiError.badRequest('Insufficient wallet balance');
      }
      wallet = updated;
    } else {
      // Credit: atomic increment
      wallet = await Wallet.findOneAndUpdate(
        { _id: wallet._id },
        { $inc: { balance: amount } },
        { returnDocument: "after", session },
      );
    }

    // Record the transaction in the embedded array
    const balanceBefore = data.type === 'credit'
      ? wallet.balance - amount
      : wallet.balance + amount;

    await Wallet.updateOne(
      { _id: wallet._id },
      {
        $push: {
          transactions: {
            $each: [{
              type: data.type,
              amount,
              balanceBefore,
              balanceAfter: wallet.balance,
              reference: data.reference || '',
              description: data.description || '',
              invoice: data.invoice || null,
              installment: data.installment || null,
              createdBy: userId || null,
            }],
            $slice: -1000,
          },
        },
      },
      { session },
    );

    return wallet;
  };

  if (externalSession) {
    return fn(externalSession);
  }
  return withTransaction(fn);
}
