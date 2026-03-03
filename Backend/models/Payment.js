// models/Payment.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  // Store the name of who collected the payment
  collectedStaff: {
    type: String,
    default: 'Unknown'
  },
  // Store the role of who collected the payment (agent, manager, admin)
  collectedByRole: {
    type: String,
    enum: ['agent', 'manager', 'admin'],
    default: 'agent'
  },
  // Store the ID of who collected the payment (references Agent, Manager, or Admin)
  collectedStaffId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Snapshot of client details at time of payment
  clientName: {
    type: String
  },
  clientPhone: {
    type: String
  },
  clientAmount: {
    type: Number
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  previousDue: {
    type: Number,
    required: true
  },
  remainingDue: {
    type: Number,
    required: true
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'online', 'cheque'],
    default: 'cash'
  },
  receiptNumber: {
    type: String,
    unique: true
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Generate receipt number before saving
paymentSchema.pre('save', async function() {
  // Generate receipt number if missing using an atomic counter to avoid
  // duplicate key errors when multiple processes create payments concurrently.
  if (!this.receiptNumber) {
    try {
      const Counter = require('./Counter');
      const Payment = this.constructor;

      // On first counter initialization, find the max sequence from existing payments
      const existingCounter = await Counter.findById('receipt');
      
      if (!existingCounter) {
        // Initialize counter by finding the max seq from existing payments
        const allPayments = await Payment.find({ receiptNumber: { $exists: true, $ne: null } })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();
        
        let maxSeq = 0;
        if (allPayments && allPayments.length > 0) {
          const receiptNum = allPayments[0].receiptNumber;
          // Extract seq from format like "RCP-2603-0009"
          const match = receiptNum.match(/-(\d{4})$/);
          if (match) {
            maxSeq = parseInt(match[1], 10);
          }
        }

        // Initialize counter to maxSeq so next increment will be maxSeq + 1
        await Counter.findByIdAndUpdate(
          'receipt',
          { seq: maxSeq },
          { upsert: true, new: false }
        );
      }

      // Atomically increment the counter
      const seqDoc = await Counter.findByIdAndUpdate(
        'receipt',
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
      );

      const seq = seqDoc.seq || 1;
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      this.receiptNumber = `RCP-${year}${month}-${seq.toString().padStart(4, '0')}`;
    } catch (err) {
      console.error('Receipt number generation error:', err.message);
      // Fallback to timestamp-based unique receipt if counter fails
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const time = date.getTime();
      this.receiptNumber = `RCP-${year}${month}-${time.toString().slice(-4)}`;
    }
  }

  // Attach a snapshot of client details so payment records are self-contained.
  try {
    const Client = require('./Client');
    if (this.client) {
      const client = await Client.findById(this.client).select('name phone amount');
      if (client) {
        this.clientName = client.name;
        this.clientPhone = client.phone;
        this.clientAmount = client.amount;
      }
    }
  } catch (err) {
    // Don't block saving payment for snapshot errors; log if needed elsewhere.
  }
});

module.exports = mongoose.model('Payment', paymentSchema);