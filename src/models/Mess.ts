import mongoose from 'mongoose'
import crypto from 'crypto'

const messSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Mess name is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
  },
  messCode: {
    type: String,
    unique: true,
    uppercase: true,
  },
  mealFrequency: {
    type: Number,
    required: true,
    enum: [2, 3], // 2 meals (Lunch, Dinner) or 3 meals (Breakfast, Lunch, Dinner)
    default: 2,
  },
  mealDeadlines: {
    breakfast: {
      type: String,
      default: '10:00',
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)
        },
        message: 'Breakfast deadline must be in HH:MM format'
      }
    },
    lunch: {
      type: String,
      default: '14:00',
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)
        },
        message: 'Lunch deadline must be in HH:MM format'
      }
    },
    dinner: {
      type: String,
      default: '20:00',
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)
        },
        message: 'Dinner deadline must be in HH:MM format'
      }
    }
  },
  adminIsActive: {
    type: Boolean,
    default: true, // Whether admin also eats meals from the mess
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  adminIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvedAt: {
      type: Date,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  }],
  currentCycle: {
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isStarted: {
    type: Boolean,
    default: false,
  },
  startedAt: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  messStatus: {
    type: String,
    enum: ['created', 'started', 'ended'],
    default: 'created',
  },
  totalDepositedAmountCurrentCycle: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
})

// Generate unique mess code before saving
messSchema.pre('save', async function (next) {
  if (!this.messCode) {
    let code: string
    let isUnique = false

    while (!isUnique) {
      // Generate a 6-character alphanumeric code
      code = crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase()

      // Check if this code already exists
      const existingMess = await (this.constructor as any).findOne({ messCode: code })
      if (!existingMess) {
        isUnique = true
      }
    }

    this.messCode = code!
  }
  next()
})

// Ensure adminIds always includes adminId before saving
messSchema.pre('save', function (next) {
  if (this.adminId) {
    if (!Array.isArray(this.adminIds)) {
      this.adminIds = [];
    }
    const adminIdStr = this.adminId.toString();
    if (!this.adminIds.some((id: any) => id.toString() === adminIdStr)) {
      this.adminIds.push(this.adminId);
    }
  }
  next();
});

// Prevent re-compilation during development
let Mess: mongoose.Model<any>
try {
  Mess = mongoose.model('Mess')
} catch (error) {
  Mess = mongoose.model('Mess', messSchema)
}

export default Mess
