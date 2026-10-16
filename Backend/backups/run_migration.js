const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const Client = mongoose.model('Client', new mongoose.Schema({}, { strict: false }));
  const Payment = mongoose.model('Payment', new mongoose.Schema({}, { strict: false }));

  // Find all clients with amount 5000
  const clients5000 = await Client.find({ amount: 5000 });
  console.log(`Found ${clients5000.length} clients with amount: 5000.`);

  // 1. Create a timestamped backup of the exact documents
  const backupData = clients5000.map(c => c.toObject());
  const backupFile = path.join(__dirname, 'backup_clients_before_fix.json');
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`Backup saved to ${backupFile}`);

  const updateSummary = [];

  for (const client of clients5000) {
    const original = {
      id: client.clientId,
      name: client.name,
      amount: client.amount,
      received: client.received,
      pending: client.pending,
      total_weeks: client.total_weeks,
      status: client.status
    };

    let newAmount = 6900;
    let newTotalWeeks = 12;
    let newReceived = client.received;
    let newPending = 0;
    let newStatus = client.status;

    if (client.status === 'paid') {
      // If the client was already marked paid (like 19C3A4 or 21C318 / 21C31D)
      // When a loan is paid, full repayment is 6900, pending is 0
      newReceived = 6900;
      newPending = 0;
      newStatus = 'paid';
    } else {
      // Partial / active clients (like 19C3BB, 19C39A, 19C395, 19C390, 19C38B, etc.)
      newReceived = Number(client.received || 0);
      newPending = Math.max(0, 6900 - newReceived);
      newStatus = newPending <= 0 ? 'paid' : 'partial';
    }

    // Apply update to MongoDB
    await Client.updateOne(
      { _id: client._id },
      {
        $set: {
          amount: newAmount,
          total_weeks: newTotalWeeks,
          received: newReceived,
          pending: newPending,
          status: newStatus
        }
      }
    );

    updateSummary.push({
      clientId: client.clientId,
      name: client.name,
      before: original,
      after: {
        amount: newAmount,
        total_weeks: newTotalWeeks,
        received: newReceived,
        pending: newPending,
        status: newStatus
      }
    });
  }

  console.log('\n--- Update Summary ---');
  updateSummary.forEach(u => {
    console.log(`Client [${u.clientId}] ${u.name}:`);
    console.log(`  Before: Amount=${u.before.amount}, Received=${u.before.received}, Pending=${u.before.pending}, Weeks=${u.before.total_weeks}, Status=${u.before.status}`);
    console.log(`  After:  Amount=${u.after.amount}, Received=${u.after.received}, Pending=${u.after.pending}, Weeks=${u.after.total_weeks}, Status=${u.after.status}`);
  });

  // Verify in MongoDB
  const remaining5000 = await Client.countDocuments({ amount: 5000 });
  console.log(`\nRemaining clients with amount 5000 in MongoDB: ${remaining5000}`);

  // Also update Frontend/src/karanfinance.clients.csv to keep it in sync
  const csvPath = path.join(__dirname, '..', 'Frontend', 'src', 'karanfinance.clients.csv');
  if (fs.existsSync(csvPath)) {
    console.log('\nUpdating Frontend/src/karanfinance.clients.csv...');
    let csvContent = fs.readFileSync(csvPath, 'utf8');

    // Simple robust update for the affected client IDs in CSV
    for (const u of updateSummary) {
      // Look for the line containing clientId
      const lines = csvContent.split('\n');
      const lineIdx = lines.findIndex(l => l.includes(u.clientId));
      if (lineIdx !== -1) {
        // Parse CSV fields of this line
        const cols = lines[lineIdx].split(',');
        // Column indices from header:
        // 0:_id, 1:name, 2:husband_name, 3:phone, 4:password, 5:landmark, 6:address, 7:district,
        // 8:amount, 9:received, 10:pending, 11:loan_start_date, 12:loan_end_date, 13:weekly_amount, 14:total_weeks, 15:status
        // Note: address or landmark might contain quotes/commas, so let's match exact pattern
        // In the CSV lines for these clients:
        // ...,Tenkasi,5000,received,pending,...
        // Let's replace systematically
        const line = lines[lineIdx];
        const oldPart = `,Tenkasi,${u.before.amount},${u.before.received},${u.before.pending},`;
        const newPart = `,Tenkasi,${u.after.amount},${u.after.received},${u.after.pending},`;
        if (line.includes(oldPart)) {
          lines[lineIdx] = line.replace(oldPart, newPart);
          // Also total_weeks: ,575,11,
          lines[lineIdx] = lines[lineIdx].replace(`,575,${u.before.total_weeks},`, `,575,${u.after.total_weeks},`);
        }
      }
      csvContent = lines.join('\n');
    }
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    console.log('Frontend CSV synchronized successfully.');
  }

  await mongoose.disconnect();
  console.log('Done!');
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
