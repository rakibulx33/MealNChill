import connectDB from '@/lib/mongodb'
import BillingCycle from '@/models/BillingCycle'
import Deposit from '@/models/Deposit'
import Expense from '@/models/Expense'
import MealAttendance from '@/models/MealAttendance'
import Mess from '@/models/Mess'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ messId: string }> }) {
  try {
    await connectDB()

    // Await params
    const { messId } = await params

    // Get token from header
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    
    // Verify token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
      if (decoded.role !== 'web_admin') {
        return NextResponse.json(
          { message: 'Access denied' },
          { status: 403 }
        )
      }
    } catch (error) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Get mess with full details
    const mess = await Mess.findById(messId)
      .populate('adminId', 'name email phone password createdAt')
      .populate('adminIds', 'name email phone password createdAt')
      .populate('members.userId', 'name email phone password role isActive createdAt')
      .populate('members.approvedBy', 'name email')
      .lean() as any

    if (!mess) {
      return NextResponse.json(
        { message: 'Mess not found' },
        { status: 404 }
      )
    }

    // Safely handle missing admin data
    if (!mess.adminId) {
      return NextResponse.json(
        { message: 'Mess admin data is corrupted' },
        { status: 500 }
      )
    }

    // Get financial statistics with error handling
    let expenseStats: any[] = []
    let depositStats: any[] = []
    let billingStats: any[] = []
    let mealStats: any[] = []
    
    try {
      [expenseStats, depositStats, billingStats] = await Promise.all([
        Expense.aggregate([
          { $match: { messId: mess._id } },
          {
            $group: {
              _id: null,
              totalExpenses: { $sum: '$amount' },
              expenseCount: { $sum: 1 },
              avgExpense: { $avg: '$amount' }
            }
          }
        ]),
        Deposit.aggregate([
          { $match: { messId: mess._id } },
          {
            $group: {
              _id: '$status',
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ]),
        BillingCycle.aggregate([
          { $match: { messId: mess._id } },
          {
            $group: {
              _id: null,
              totalBillingCycles: { $sum: 1 },
              completedCycles: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
            }
          }
        ])
      ])
    } catch (aggregationError) {
      console.error('Error in financial aggregation:', aggregationError)
      // Set default values if aggregation fails
      expenseStats = []
      depositStats = []
      billingStats = []
    }

    // Get meal attendance statistics with error handling
    try {
      mealStats = await MealAttendance.aggregate([
        { $match: { messId: mess._id } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
            },
            totalBreakfastsDay: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$mealSlot', 'breakfast'] }, { $eq: ['$isMealOn', true] }] },
                  { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                  { $cond: [{ $eq: ['$mealSlot', 'breakfast'] }, { $ifNull: ['$extraMealCount', 0] }, 0] }
                ]
              }
            },
            totalLunchesDay: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$mealSlot', 'lunch'] }, { $eq: ['$isMealOn', true] }] },
                  { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                  { $cond: [{ $eq: ['$mealSlot', 'lunch'] }, { $ifNull: ['$extraMealCount', 0] }, 0] }
                ]
              }
            },
            totalDinnersDay: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$mealSlot', 'dinner'] }, { $eq: ['$isMealOn', true] }] },
                  { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                  { $cond: [{ $eq: ['$mealSlot', 'dinner'] }, { $ifNull: ['$extraMealCount', 0] }, 0] }
                ]
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalMealDays: { $sum: 1 },
            totalBreakfasts: { $sum: '$totalBreakfastsDay' },
            totalLunches: { $sum: '$totalLunchesDay' },
            totalDinners: { $sum: '$totalDinnersDay' }
          }
        }
      ])
    } catch (mealStatsError) {
      console.error('Error in meal stats aggregation:', mealStatsError)
      mealStats = []
    }    // Get recent activities with error handling
    let recentExpenses: any[] = []
    let recentDeposits: any[] = []
    
    try {
      recentExpenses = await Expense.find({ messId: mess._id })
        .populate('enteredByUserId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    } catch (expenseError) {
      console.error('Error fetching recent expenses:', expenseError)
    }

    try {
      recentDeposits = await Deposit.find({ messId: mess._id })
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    } catch (depositError) {
      console.error('Error fetching recent deposits:', depositError)
    }

    // Format deposit statistics
    const depositStatsFormatted = {
      pending: depositStats.find(d => d._id === 'pending') || { totalAmount: 0, count: 0 },
      approved: depositStats.find(d => d._id === 'approved') || { totalAmount: 0, count: 0 },
      rejected: depositStats.find(d => d._id === 'rejected') || { totalAmount: 0, count: 0 }
    }

    // Format comprehensive mess details
    const messDetails = {
      // Basic Information
      id: mess._id,
      name: mess.name,
      description: mess.description,
      address: mess.address,
      messCode: mess.messCode,
      mealFrequency: mess.mealFrequency,
      mealDeadlines: mess.mealDeadlines,
      adminIsActive: mess.adminIsActive,
      createdAt: mess.createdAt,
      updatedAt: mess.updatedAt,

      // Admin Information (with sensitive data)
      admin: {
        id: mess.adminId?._id || mess.adminId,
        name: mess.adminId?.name || 'Unknown Admin',
        email: mess.adminId?.email || 'N/A',
        phone: mess.adminId?.phone || 'N/A',
        password: mess.adminId?.password || 'N/A', // Include password for admin view
        createdAt: mess.adminId?.createdAt || mess.createdAt
      },

      // Additional Admins
      additionalAdmins: mess.adminIds?.map((admin: any) => ({
        id: admin?._id || admin,
        name: admin?.name || 'Unknown Admin',
        email: admin?.email || 'N/A',
        phone: admin?.phone || 'N/A',
        password: admin?.password || 'N/A', // Include password for admin view
        createdAt: admin?.createdAt || new Date()
      })) || [],

      // Members with full details
      members: mess.members?.map((member: any) => ({
        id: member.userId?._id || member.userId,
        name: member.userId?.name || 'Unknown Member',
        email: member.userId?.email || 'N/A',
        phone: member.userId?.phone || 'N/A',
        password: member.userId?.password || 'N/A', // Include password for admin view
        role: member.userId?.role || 'member',
        isActive: member.isActive || false,
        isApproved: member.isApproved || false,
        joinedAt: member.joinedAt,
        approvedAt: member.approvedAt,
        approvedBy: member.approvedBy ? {
          name: member.approvedBy?.name || 'Unknown',
          email: member.approvedBy?.email || 'N/A'
        } : null,
        userCreatedAt: member.userId?.createdAt || new Date(),
        userIsActive: member.userId?.isActive || false
      })) || [],

      // Statistics
      statistics: {
        members: {
          total: mess.members?.length || 0,
          active: mess.members?.filter((m: any) => m.isActive && m.isApproved).length || 0,
          pending: mess.members?.filter((m: any) => !m.isApproved).length || 0,
          inactive: mess.members?.filter((m: any) => !m.isActive).length || 0,
          admins: (mess.adminIds?.length || 0) + 1 // Include main admin
        },
        finances: {
          expenses: expenseStats[0] || { totalExpenses: 0, expenseCount: 0, avgExpense: 0 },
          deposits: {
            pending: depositStatsFormatted.pending,
            approved: depositStatsFormatted.approved,
            rejected: depositStatsFormatted.rejected,
            total: {
              totalAmount: Object.values(depositStatsFormatted).reduce((sum: number, stat: any) => sum + stat.totalAmount, 0),
              count: Object.values(depositStatsFormatted).reduce((sum: number, stat: any) => sum + stat.count, 0)
            }
          },
          billing: billingStats[0] || { totalBillingCycles: 0, completedCycles: 0 },
          // Add missing financial fields that frontend expects
          totalDeposits: Object.values(depositStatsFormatted).reduce((sum: number, stat: any) => sum + stat.totalAmount, 0),
          approvedDeposits: depositStatsFormatted.approved.totalAmount || 0,
          pendingDeposits: depositStatsFormatted.pending.totalAmount || 0,
          totalExpenses: expenseStats[0]?.totalExpenses || 0,
          currentBalance: (Object.values(depositStatsFormatted).reduce((sum: number, stat: any) => sum + stat.totalAmount, 0)) - (expenseStats[0]?.totalExpenses || 0)
        },
        meals: mealStats[0] || {
          totalMealDays: 0,
          totalBreakfasts: 0,
          totalLunches: 0,
          totalDinners: 0
        }
      },

      // Recent Activities
      recentActivities: {
        expenses: recentExpenses.map((expense: any) => ({
          id: expense._id,
          title: expense.itemName || 'Unknown Item',
          amount: expense.amount,
          category: 'Food/Mess',
          addedBy: expense.enteredByUserId ? (expense.enteredByUserId.name || 'Unknown') : 'Unknown',
          createdAt: expense.createdAt
        })),
        deposits: recentDeposits.map((deposit: any) => ({
          id: deposit._id,
          amount: deposit.amount,
          status: deposit.status,
          method: deposit.note || 'Deposit',
          user: deposit.userId ? (deposit.userId.name || 'Unknown') : 'Unknown',
          createdAt: deposit.createdAt
        }))
      }
    }

    return NextResponse.json({ mess: messDetails }, { status: 200 })

  } catch (error) {
    console.error('Get mess details error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
