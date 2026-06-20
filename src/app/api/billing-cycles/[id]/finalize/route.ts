import connectDB from '@/lib/mongodb'
import BillingCycle from '@/models/BillingCycle'
import Deposit from '@/models/Deposit'
import Expense from '@/models/Expense'
import MealAttendance from '@/models/MealAttendance'
import MemberSettlement from '@/models/MemberSettlement'
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params
    const cycleId = resolvedParams.id
    const cycle = await BillingCycle.findById(cycleId)

    if (!cycle || cycle.messId.toString() !== decoded.messId) {
      return NextResponse.json({ message: 'Billing cycle not found' }, { status: 404 })
    }

    if (cycle.status === 'finalized') {
      return NextResponse.json({ message: 'Billing cycle already finalized' }, { status: 400 })
    }

    // Calculate total expenses for the cycle
    const totalExpenses = await Expense.aggregate([
      {
        $match: {
          messId: decoded.messId,
          date: {
            $gte: cycle.startDate,
            $lte: cycle.endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ])

    const finalTotalExpenses = totalExpenses[0]?.total || 0

    // Calculate total meals prepared for the cycle
    const totalMeals = await MealAttendance.aggregate([
      {
        $match: {
          messId: decoded.messId,
          date: {
            $gte: cycle.startDate,
            $lte: cycle.endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          totalMeals: {
            $sum: {
              $cond: [
                { $eq: ['$isMealOn', true] },
                { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                { $ifNull: ['$extraMealCount', 0] }
              ]
            }
          }
        }
      }
    ])

    const finalTotalMealsPrepared = totalMeals[0]?.totalMeals || 1
    const finalCostPerMeal = finalTotalExpenses / finalTotalMealsPrepared

    // Get all members and calculate their individual settlements
    const members = await User.find({ messId: decoded.messId })

    for (const member of members) {
      // Calculate total deposits for this member during the cycle
      const memberDeposits = await Deposit.aggregate([
        {
          $match: {
            messId: decoded.messId,
            userId: member._id,
            status: 'approved',
            date: {
              $gte: cycle.startDate,
              $lte: cycle.endDate
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ])

      const totalDepositsForCycle = memberDeposits[0]?.total || 0

      // Calculate total meals consumed by this member during the cycle
      const memberMeals = await MealAttendance.aggregate([
        {
          $match: {
            messId: decoded.messId,
            userId: member._id,
            date: {
              $gte: cycle.startDate,
              $lte: cycle.endDate
            }
          }
        },
        {
          $group: {
            _id: null,
            totalMeals: {
              $sum: {
                $cond: [
                  { $eq: ['$isMealOn', true] },
                  { $add: [1, { $ifNull: ['$extraMealCount', 0] }] },
                  { $ifNull: ['$extraMealCount', 0] }
                ]
              }
            }
          }
        }
      ])

      const totalMealsConsumedForCycle = memberMeals[0]?.totalMeals || 0

      // Calculate individual meal cost and final balance
      const calculatedIndividualMealCost = totalMealsConsumedForCycle * finalCostPerMeal
      const finalBalance = totalDepositsForCycle - calculatedIndividualMealCost

      // Create or update member settlement
      await MemberSettlement.findOneAndUpdate(
        {
          billingCycleId: cycleId,
          userId: member._id
        },
        {
          messId: decoded.messId,
          billingCycleId: cycleId,
          userId: member._id,
          userName: member.name,
          totalDepositsForCycle,
          totalMealsConsumedForCycle,
          calculatedIndividualMealCost,
          finalBalance,
          status: finalBalance < 0 ? 'unpaid' : finalBalance > 0 ? 'pending_refund' : 'settled'
        },
        { upsert: true, new: true }
      )
    }

    // Update the billing cycle
    cycle.finalTotalExpenses = finalTotalExpenses
    cycle.finalTotalMealsPrepared = finalTotalMealsPrepared
    cycle.finalCostPerMeal = finalCostPerMeal
    cycle.status = 'finalized'
    cycle.finalizedAt = new Date()

    await cycle.save()

    return NextResponse.json({
      message: 'Billing cycle finalized successfully',
      cycle: {
        ...cycle.toObject(),
        finalTotalExpenses,
        finalTotalMealsPrepared,
        finalCostPerMeal
      }
    })
  } catch (error) {
    console.error('Error finalizing billing cycle:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
