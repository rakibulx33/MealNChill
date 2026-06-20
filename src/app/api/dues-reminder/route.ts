import connectDB from '@/lib/mongodb'
import BillingCycle from '@/models/BillingCycle'
import MemberSettlement from '@/models/MemberSettlement'
import Notification from '@/models/Notification'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

const verifyToken = async (token: string) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    return decoded
  } catch (error) {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ message: 'No token provided' }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded || !decoded.messId || !decoded.isAdmin) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    const { userId, cycleId } = await request.json()

    // Get the billing cycle and settlement details
    const cycle = await BillingCycle.findById(cycleId)
    const settlement = await MemberSettlement.findOne({
      billingCycleId: cycleId,
      userId: userId
    })

    if (!cycle || !settlement) {
      return NextResponse.json({ message: 'Cycle or settlement not found' }, { status: 404 })
    }

    const dueAmount = Math.abs(settlement.finalBalance)

    // Create notification for the user
    const notification = new Notification({
      messId: decoded.messId,
      recipientId: userId,
      type: 'dues_reminder',
      title: 'Payment Due Reminder',
      message: `You have an outstanding payment of ৳${dueAmount.toFixed(2)} for billing cycle "${cycle.name}". Please settle your dues at the earliest.`,
      isRead: false
    })

    await notification.save()

    return NextResponse.json({
      message: 'Dues reminder sent successfully'
    })
  } catch (error) {
    console.error('Error sending dues reminder:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
