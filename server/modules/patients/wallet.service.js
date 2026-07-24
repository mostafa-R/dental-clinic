import Wallet from './wallet.model.js';
import ApiError from '../../utils/ApiError.js';
import { withTransaction } from '../../core/transaction.js';

/**
 * Find or create a wallet for a patient.
 * Uses upsert with duplicate-key race handling.
 */
export async function getOrCreateWallet(patient) {
  let wallet = await Wallet.findOne({ patient: patient._id });
  if (!wallet) {
    try {
      wallet = await Wallet.findOneAndUpdate(
        { patient: patient._id },
        {
          $setOnInsert: {
            branch: patient.branch,
            tenant: patient.tenant,
            patient: patient._id,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (err) {
      if (err.code === 11000) {
        wallet = await Wallet.findOne({ patient: patient._id });
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
    let wallet = await Wallet.findOne({ patient: patient._id }).session(session);
    if (!wallet) {
      try {
        wallet = await Wallet.findOneAndUpdate(
          { patient: patient._id },
          {
            $setOnInsert: {
              branch: patient.branch,
              tenant: patient.tenant,
              patient: patient._id,
            },
          },
          { upsert: true, new: true, runValidators: true, session },
        );
      } catch (err) {
        if (err.code === 11000) {
          wallet = await Wallet.findOne({ patient: patient._id }).session(session);
        } else {
          throw err;
        }
      }
    }

    // Atomic balance check + update using $inc
    if (data.type === 'debit') {
      const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: data.amount } },
        { $inc: { balance: -Math.abs(data.amount) } },
        { new: true, session },
      );
      if (!updated) {
        throw ApiError.badRequest('Insufficient wallet balance');
      }
      wallet = updated;
    } else {
      // Credit: atomic increment
      wallet = await Wallet.findOneAndUpdate(
        { _id: wallet._id },
        { $inc: { balance: Math.abs(data.amount) } },
        { new: true, session },
      );
    }

    // Record the transaction in the embedded array
    const balanceBefore = data.type === 'credit'
      ? wallet.balance - Math.abs(data.amount)
      : wallet.balance + Math.abs(data.amount);

    await Wallet.updateOne(
      { _id: wallet._id },
      {
        $push: {
          transactions: {
            $each: [{
              type: data.type,
              amount: Math.abs(data.amount),
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
