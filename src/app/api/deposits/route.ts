import { isUserAdminOfMess } from '@/lib/adminUtils'
import connectDB from '@/lib/mongodb'
import Deposit from '@/models/Deposit'
import Mess from '@/models/Mess'
import User from '@/models/User'
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

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ message: 'No token provided' }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Get user to find their mess
    const user = await User.findById(decoded.userId)
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status') // 'pending', 'approved', 'rejected', or null for all

    // Build filter
    const filter: any = { messId: user.messId }
    if (status) {
      filter.status = status
    }

    const deposits = await Deposit.find(filter)
      .populate('userId', 'name')
      .populate('approvedByUserId', 'name')
      .sort({ createdAt: -1 })
      .lean()

    // Calculate total approved deposits only
    const totalApprovedDeposits = await Deposit.aggregate([
      {
        $match: {
          messId: user.messId,
          status: 'approved'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ])

    // Get current mess info for total deposited amount in current cycle
    const mess = await Mess.findById(user.messId)

    // Get pending deposits count for UI notification
    const pendingCount = await Deposit.countDocuments({
      messId: user.messId,
      status: 'pending'
    })

    const mappedDeposits = deposits.map((deposit: any) => {
      const dObj = deposit.toObject ? deposit.toObject() : deposit;
      
      const userFallback = dObj.userId ? dObj.userId : { _id: 'deleted', name: 'Deleted User', email: '' };
      
      let approvedByFallback = dObj.approvedByUserId;
      if (!approvedByFallback && deposit.approvedByUserId) {
        approvedByFallback = { _id: 'deleted', name: 'Deleted User' };
      }
      
      return {
        ...dObj,
        userId: userFallback,
        approvedByUserId: approvedByFallback
      };
    });

    return NextResponse.json({
      deposits: mappedDeposits,
      totalApprovedDeposits: totalApprovedDeposits[0]?.total || 0,
      totalDepositedAmountCurrentCycle: mess?.totalDepositedAmountCurrentCycle || 0,
      pendingCount
    })
  } catch (error) {
    console.error('Error fetching deposits:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
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
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Get user to find their mess
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const { userId, amount, date, note, isDirectEntry } = await request.json()

    // Validate amount
    if (!amount || amount <= 0) {
      return NextResponse.json({ message: 'Invalid amount' }, { status: 400 })
    }

    // If userId is provided, verify user belongs to the mess
    let targetUserId = userId || decoded.userId
    const user = await User.findOne({ _id: targetUserId, messId: currentUser.messId })
    if (!user) {
      return NextResponse.json({ message: 'User not found in this mess' }, { status: 404 })
    }

    // Determine status and handling based on user role and type of entry
    let status = 'pending'
    let approvedByUserId = null

    // Check if user is admin using centralized checking
    const isAdmin = await isUserAdminOfMess(decoded.userId, currentUser.messId.toString())

    if (isDirectEntry && isAdmin) {
      // Admin direct entry - automatically approved
      status = 'approved'
      approvedByUserId = decoded.userId
    } else if (isAdmin && userId && userId !== decoded.userId) {
      // Admin adding deposit for another member - automatically approved
      status = 'approved'
      approvedByUserId = decoded.userId
    }
    // Regular member submissions remain pending

    const deposit = new Deposit({
      messId: currentUser.messId,
      userId: targetUserId,
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      note: note || '',
      status,
      approvedByUserId
    })

    await deposit.save()

    // If approved immediately, update mess total deposited amount
    if (status === 'approved') {
      await Mess.findByIdAndUpdate(
        currentUser.messId,
        { $inc: { totalDepositedAmountCurrentCycle: deposit.amount } }
      )
    }

    // Populate user info for response
    await deposit.populate('userId', 'name')
    if (approvedByUserId) {
      await deposit.populate('approvedByUserId', 'name')
    }

    return NextResponse.json({
      message: status === 'approved' ? 'Deposit added and approved successfully' : 'Deposit request submitted for approval',
      deposit
    })
  } catch (error) {
    console.error('Error adding deposit:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
