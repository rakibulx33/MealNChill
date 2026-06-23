import connectDB from '@/lib/mongodb'
import Deposit from '@/models/Deposit'
import Expense from '@/models/Expense'
import MealAttendance from '@/models/MealAttendance'
import User from '@/models/User'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await connectDB()

    // Await params
    const { userId } = await params

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

    // Get user with full details including password
    const user = await User.findById(userId)
      .populate('messId', 'name messCode address adminId members')
      .lean() as any

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      )
    }

    // Get user's meal attendance statistics
    const mealStats = await MealAttendance.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
          },
          totalMealsDay: {
            $sum: {
              $cond: [
                { $eq: ['$isMealOn', true] },
                { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                { $ifNull: ['$extraMealCount', 0] }
              ]
            }
          },
          breakfastCountDay: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$mealSlot', 'breakfast'] }, { $eq: ['$isMealOn', true] }] },
                { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                { $cond: [{ $eq: ['$mealSlot', 'breakfast'] }, { $ifNull: ['$extraMealCount', 0] }, 0] }
              ]
            }
          },
          lunchCountDay: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$mealSlot', 'lunch'] }, { $eq: ['$isMealOn', true] }] },
                { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                { $cond: [{ $eq: ['$mealSlot', 'lunch'] }, { $ifNull: ['$extraMealCount', 0] }, 0] }
              ]
            }
          },
          dinnerCountDay: {
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
          totalMeals: { $sum: '$totalMealsDay' },
          totalDays: { $sum: 1 },
          breakfastCount: { $sum: '$breakfastCountDay' },
          lunchCount: { $sum: '$lunchCountDay' },
          dinnerCount: { $sum: '$dinnerCountDay' }
        }
      }
    ])

    // Get user's expense contributions
    const expenseStats = user.messId ? await Expense.aggregate([
      { $match: { messId: new mongoose.Types.ObjectId(user.messId._id) } },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          expenseCount: { $sum: 1 }
        }
      }
    ]) : []

    // Get user's deposit history
    const depositStats = await Deposit.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(user._id) } },
      {
        $group: {
          _id: null,
          totalDeposits: { $sum: '$amount' },
          depositCount: { $sum: 1 },
          pendingDeposits: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
          approvedDeposits: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } }
        }
      }
    ])

    // Get recent activities
    const recentMeals = await MealAttendance.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(user._id) } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          date: { $first: "$date" },
          slots: {
            $push: {
              slot: "$mealSlot",
              isMealOn: "$isMealOn",
              extra: "$extraMealCount"
            }
          }
        }
      },
      { $sort: { date: -1 } },
      { $limit: 10 }
    ])

    const recentDeposits = await Deposit.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()

    // Format the comprehensive user profile
    const userProfile = {
      // Basic Information
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: user.password, // Include password for admin view (hashed)
      role: user.role,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,

      // Mess Information
      mess: user.messId ? {
        id: user.messId._id,
        name: user.messId.name,
        messCode: user.messId.messCode,
        address: user.messId.address,
        isMessAdmin: user.messId.adminId?.toString() === user._id.toString(),
        totalMembers: user.messId.members?.length || 0
      } : null,

      // Statistics
      statistics: {
        meals: mealStats[0] || {
          totalMeals: 0,
          totalDays: 0,
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0
        },
        expenses: expenseStats[0] || {
          totalExpenses: 0,
          expenseCount: 0
        },
        deposits: depositStats[0] || {
          totalDeposits: 0,
          depositCount: 0,
          pendingDeposits: 0,
          approvedDeposits: 0
        }
      },

      // Recent Activities
      recentActivities: {
        meals: recentMeals.map(meal => {
          const breakfastSlot = meal.slots.find((s: any) => s.slot === 'breakfast');
          const lunchSlot = meal.slots.find((s: any) => s.slot === 'lunch');
          const dinnerSlot = meal.slots.find((s: any) => s.slot === 'dinner');

          let mealsCount = 0;
          if (breakfastSlot?.isMealOn) mealsCount += 1 + (breakfastSlot.extra || 0);
          if (lunchSlot?.isMealOn) mealsCount += 1 + (lunchSlot.extra || 0);
          if (dinnerSlot?.isMealOn) mealsCount += 1 + (dinnerSlot.extra || 0);

          return {
            date: meal.date,
            breakfast: !!breakfastSlot?.isMealOn,
            lunch: !!lunchSlot?.isMealOn,
            dinner: !!dinnerSlot?.isMealOn,
            mealsCount
          };
        }),
        deposits: recentDeposits.map(deposit => ({
          id: deposit._id,
          amount: deposit.amount,
          status: deposit.status,
          method: deposit.method,
          createdAt: deposit.createdAt
        }))
      }
    }

    return NextResponse.json({ user: userProfile }, { status: 200 })

  } catch (error) {
    console.error('Get user profile error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
