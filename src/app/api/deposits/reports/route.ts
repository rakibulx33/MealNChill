import connectDB from '@/lib/mongodb'
import Deposit from '@/models/Deposit'
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
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    // Get the user to find their mess ID
    const user = await User.findById(decoded.userId)
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const messId = user.messId

    const url = new URL(request.url)
    const period = url.searchParams.get('period') || 'current-month' // 'current-month', 'last-month', 'all-time'
    
    // Calculate date range based on period
    let startDate: Date
    let endDate: Date = new Date()
    
    switch (period) {
      case 'current-month':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        break
      case 'last-month':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1)
        endDate = new Date(endDate.getFullYear(), endDate.getMonth(), 0)
        break
      case 'all-time':
      default:
        startDate = new Date('2020-01-01') // Far back date
        break
    }

    // Check total deposits in this mess
    const totalDepositsInMess = await Deposit.countDocuments({ messId: messId })
    const approvedDepositsInMess = await Deposit.countDocuments({ messId: messId, status: 'approved' })

    // Get all approved deposits for the period with detailed user info
    const deposits = await Deposit.find({
      messId: messId,
      status: 'approved',
      createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('userId', 'name email phone')
    .populate('approvedByUserId', 'name')
    .sort({ createdAt: -1 })
    .lean()

    // Get summary by user
    const userSummary = await Deposit.aggregate([
      {
        $match: {
          messId: messId,
          status: 'approved',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalAmount: { $sum: '$amount' },
          depositCount: { $sum: 1 },
          lastDepositDate: { $max: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: '$userInfo'
      },
      {
        $project: {
          _id: 1,
          totalAmount: 1,
          depositCount: 1,
          lastDepositDate: 1,
          name: '$userInfo.name',
          email: '$userInfo.email'
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ])

    // Calculate overall statistics
    const totalDeposits = deposits.reduce((sum, deposit) => sum + deposit.amount, 0)
    const totalTransactions = deposits.length
    const averageDepositAmount = totalTransactions > 0 ? totalDeposits / totalTransactions : 0

    // Group deposits by month for trend analysis with proper month names
    const monthlyTrends = await Deposit.aggregate([
      {
        $match: {
          messId: messId,
          status: 'approved',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalAmount: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          firstDay: { $min: '$createdAt' },
          lastDay: { $max: '$createdAt' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          monthName: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id.month', 1] }, then: 'January' },
                { case: { $eq: ['$_id.month', 2] }, then: 'February' },
                { case: { $eq: ['$_id.month', 3] }, then: 'March' },
                { case: { $eq: ['$_id.month', 4] }, then: 'April' },
                { case: { $eq: ['$_id.month', 5] }, then: 'May' },
                { case: { $eq: ['$_id.month', 6] }, then: 'June' },
                { case: { $eq: ['$_id.month', 7] }, then: 'July' },
                { case: { $eq: ['$_id.month', 8] }, then: 'August' },
                { case: { $eq: ['$_id.month', 9] }, then: 'September' },
                { case: { $eq: ['$_id.month', 10] }, then: 'October' },
                { case: { $eq: ['$_id.month', 11] }, then: 'November' },
                { case: { $eq: ['$_id.month', 12] }, then: 'December' }
              ],
              default: 'Unknown'
            }
          },
          period: {
            $concat: [
              {
                $switch: {
                  branches: [
                    { case: { $eq: ['$_id.month', 1] }, then: 'January' },
                    { case: { $eq: ['$_id.month', 2] }, then: 'February' },
                    { case: { $eq: ['$_id.month', 3] }, then: 'March' },
                    { case: { $eq: ['$_id.month', 4] }, then: 'April' },
                    { case: { $eq: ['$_id.month', 5] }, then: 'May' },
                    { case: { $eq: ['$_id.month', 6] }, then: 'June' },
                    { case: { $eq: ['$_id.month', 7] }, then: 'July' },
                    { case: { $eq: ['$_id.month', 8] }, then: 'August' },
                    { case: { $eq: ['$_id.month', 9] }, then: 'September' },
                    { case: { $eq: ['$_id.month', 10] }, then: 'October' },
                    { case: { $eq: ['$_id.month', 11] }, then: 'November' },
                    { case: { $eq: ['$_id.month', 12] }, then: 'December' }
                  ],
                  default: 'Unknown'
                }
              },
              ' ',
              { $toString: '$_id.year' }
            ]
          },
          totalAmount: { $round: ['$totalAmount', 2] },
          transactionCount: 1,
          averagePerTransaction: { 
            $round: [{ $divide: ['$totalAmount', '$transactionCount'] }, 2] 
          },
          periodStart: {
            $dateToString: {
              format: '%Y-%m-01',
              date: '$firstDay'
            }
          },
          periodEnd: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$lastDay'
            }
          }
        }
      }
    ])

    return NextResponse.json({
      success: true,
      data: {
        period,
        summary: {
          totalDeposits,
          totalTransactions,
          averageDepositAmount: Math.round(averageDepositAmount * 100) / 100,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        },
        transactions: deposits.map(deposit => ({
          id: deposit._id,
          amount: deposit.amount,
          user: deposit.userId ? {
            id: deposit.userId._id,
            name: deposit.userId.name,
            email: deposit.userId.email
          } : {
            id: 'deleted',
            name: 'Deleted User',
            email: ''
          },
          approvedBy: deposit.approvedByUserId ? {
            id: deposit.approvedByUserId._id,
            name: deposit.approvedByUserId.name
          } : null,
          createdAt: deposit.createdAt,
          approvedAt: deposit.updatedAt
        })),
        userSummary,
        monthlyTrends
      }
    })

  } catch (error) {
    console.error('Error fetching deposit reports:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
