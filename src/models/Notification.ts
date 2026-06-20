import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  messId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mess',
    required: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // null means notification is for all mess members
  },
  type: {
    type: String,
    required: true,
    enum: [
      'meal_off',
      'extra_meal',
      'meal_attendance',
      'meal_preparation',
      'meal_routine',
      'low_inventory',
      'deposit_status',
      'dues_reminder',
      'general',
      'admin_promotion',
      'admin_demotion',
      'admin_transfer',
      'admin_self_demotion',
      'admin_change',
      'leave_request',
      'leave_request_approved',
      'leave_request_rejected',
      'member_left',
      'member_removed',
      'join_request',
      'mess_management'
    ],
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  relatedData: {
    // Flexible field to store additional context
    // e.g., { itemName: "Chicken", quantity: 5, userId: "...", date: "..." }
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
}, {
  timestamps: true,
})

// Index for efficient querying
notificationSchema.index({ messId: 1, recipientId: 1, createdAt: -1 })
notificationSchema.index({ messId: 1, isRead: 1, createdAt: -1 })

// Prevent re-compilation during development
let Notification: mongoose.Model<any>
try {
  Notification = mongoose.model('Notification')
} catch (error) {
  Notification = mongoose.model('Notification', notificationSchema)
}

export default Notification
