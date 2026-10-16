const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const Client = mongoose.model('Client', new mongoose.Schema({}, { strict: false }));

  // Find all clients with total_weeks == 11
  const clients11 = await Client.find({ total_weeks: 11 });
  console.log(`Found ${clients11.length} clients with total_weeks == 11.`);

  if (clients11.length === 0) {
    console.log('No clients need update.');
    process.exit(0);
  }

  // Backup
  const backupFile = path.join(__dirname, 'backup_clients_weeks11.json');
  fs.writeFileSync(backupFile, JSON.stringify(clients11, null, 2), 'utf8');
  console.log(`Backup saved to ${backupFile}`);

  // Update in MongoDB
  const result = await Client.updateMany(
    { total_weeks: 11 },
    { $set: { total_weeks: 12 } }
  );
  console.log(`MongoDB updateMany result: matched ${result.matchedCount}, modified ${result.modifiedCount}`);

  // Update CSV
  const csvPath = path.join(__dirname, '..', 'Frontend', 'src', 'karanfinance.clients.csv');
  if (fs.existsSync(csvPath)) {
    console.log(`Updating ${csvPath}...`);
    let csv = fs.readFileSync(csvPath, 'utf8');
    const lines = csv.split('\n');
    let csvUpdatedCount = 0;

    const newLines = lines.map(line => {
      // Look for client lines with weekly_amount 575 and total_weeks 11: ,575,11,
      if (line.includes(',575,11,')) {
        csvUpdatedCount++;
        return line.replace(',575,11,', ',575,12,');
      }
      return line;
    });

    fs.writeFileSync(csvPath, newLines.join('\n'), 'utf8');
    console.log(`Updated ${csvUpdatedCount} rows in CSV.`);
  }

  // Verify target clients
  const targetIds = ['973F20', '0D82E4', '0D82DA'];
  for (const id of targetIds) {
    const c = await Client.findOne({ clientId: id });
    if (c) {
      console.log(`Verified [${c.clientId}] ${c.name}: total_weeks=${c.total_weeks}, amount=${c.amount}, received=${c.received}, pending=${c.pending}, status=${c.status}`);
    }
  }

  const remaining11 = await Client.countDocuments({ total_weeks: 11 });
  console.log(`Remaining clients with total_weeks == 11: ${remaining11}`);

  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
