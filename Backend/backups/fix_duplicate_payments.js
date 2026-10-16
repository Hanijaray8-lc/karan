/**
 * fix_duplicate_payments.js
 * 
 * Fixes duplicate payments on 2026-09-26 for 2 clients.
 * Each client was accidentally paid TWICE on that date.
 * This script removes the SECOND (duplicate) payment for each client
 * and restores the client's remainingDue by adding back 575 (the payment amount).
 * 
 * Duplicate payments to DELETE:
 *   - _id: 6ab7ea0b082d346e85ee8b03  (client: 6a4c691b156f55af36e601a3, 15:51 PM)
 *   - _id: 6ab7ea65082d346e85ee8b49  (client: 6a4c69a2156f55af36e601a8, 15:53 PM)
 * 
 * The FIRST payments (08:02 AM) will remain intact.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

// The duplicate payment IDs to delete (the second/afternoon payments)
const DUPLICATE_PAYMENT_IDS = [
  '6ab7ea0b082d346e85ee8b03', // client 6a4c691b156f55af36e601a3 - paid again at 15:51 PM
  '6ab7ea65082d346e85ee8b49', // client 6a4c69a2156f55af36e601a8 - paid again at 15:53 PM
];

// Amount to restore back to each client's remainingDue
const PAYMENT_AMOUNT = 575;

async function fixDuplicatePayments() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!\n');

  const db = mongoose.connection.db;
  const paymentsCol = db.collection('payments');
  const clientsCol = db.collection('clients');

  for (const paymentId of DUPLICATE_PAYMENT_IDS) {
    const oid = new mongoose.Types.ObjectId(paymentId);

    // 1. Find the payment to get client info
    const payment = await paymentsCol.findOne({ _id: oid });
    if (!payment) {
      console.log(`⚠️  Payment ${paymentId} NOT FOUND - skipping`);
      continue;
    }

    console.log(`Found duplicate payment:`);
    console.log(`  _id:         ${payment._id}`);
    console.log(`  client:      ${payment.client}`);
    console.log(`  clientName:  ${payment.clientName}`);
    console.log(`  amount:      ${payment.amount}`);
    console.log(`  paymentDate: ${payment.paymentDate}`);
    console.log(`  receiptNo:   ${payment.receiptNumber}`);

    // 2. Get current client remainingDue
    const clientId = payment.client;
    const client = await clientsCol.findOne({ _id: new mongoose.Types.ObjectId(clientId.toString()) });
    if (!client) {
      console.log(`  ⚠️  Client ${clientId} NOT FOUND`);
      continue;
    }

    const currentRemainingDue = client.remainingDue || 0;
    const newRemainingDue = currentRemainingDue + PAYMENT_AMOUNT;

    console.log(`  Client remainingDue: ${currentRemainingDue} → ${newRemainingDue} (restoring +${PAYMENT_AMOUNT})`);

    // 3. Delete the duplicate payment
    const deleteResult = await paymentsCol.deleteOne({ _id: oid });
    if (deleteResult.deletedCount === 1) {
      console.log(`  ✅ Payment deleted successfully`);
    } else {
      console.log(`  ❌ Payment deletion failed`);
      continue;
    }

    // 4. Restore client's remainingDue
    const updateResult = await clientsCol.updateOne(
      { _id: new mongoose.Types.ObjectId(clientId.toString()) },
      { $set: { remainingDue: newRemainingDue } }
    );

    if (updateResult.modifiedCount === 1) {
      console.log(`  ✅ Client remainingDue restored to ${newRemainingDue}`);
    } else {
      console.log(`  ⚠️  Client remainingDue update may have failed (modifiedCount=${updateResult.modifiedCount})`);
    }

    console.log('');
  }

  console.log('✅ Done fixing duplicate payments!');
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

fixDuplicatePayments().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
