import mongoose from 'mongoose';
import Wallet from './wallet.model.js';
import ApiError from '../../utils/ApiError.js';

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
      // Duplicate key race — another request created it first.
      if (err.code === 11000) {
        wallet = await Wallet.findOne({ patient: patient._id });
      } else {
        throw err;
      }
    }
  }
  return wallet;
}

export async function addTransaction(patient, data, userId) {
  const session = await mongoose.startSession();
  let wallet;
  try {
    session.startTransaction();

    wallet = await Wallet.findOne({ patient: patient._id }).session(session);
    if (!wallet) {
      try {
        [wallet] = await Wallet.findOneAndUpdate(
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

    if (data.type === 'debit' && wallet.balance < data.amount) {
      throw ApiError.badRequest('Insufficient wallet balance');
    }

    wallet.addTransaction({
      type: data.type,
      amount: data.amount,
      reference: data.reference,
      description: data.description,
      invoice: data.invoice,
      installment: data.installment,
      userId,
    });

    await wallet.save({ session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return wallet;
}
