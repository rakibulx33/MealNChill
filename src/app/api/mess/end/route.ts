import connectDB from '@/lib/mongodb'
import Deposit from '@/models/Deposit'
import Expense from '@/models/Expense'
import MealAttendance from '@/models/MealAttendance'
import Mess from '@/models/Mess'
import Notification from '@/models/Notification'
import User from '@/models/User'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

const getBangladeshDateString = (date: Date) => {
  const bdTime = new Date(date.getTime() + 6 * 60 * 60 * 1000)
  const y = bdTime.getUTCFullYear()
  const m = String(bdTime.getUTCMonth() + 1).padStart(2, '0')
  const d = String(bdTime.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    // Get token from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const userId = decoded.userId

    // Get user to check admin status
    const user = await User.findById(userId)
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ message: 'Only admins can end the mess' }, { status: 403 })
    }

    const messId = user.messId
    if (!messId) {
      return NextResponse.json({ message: 'User is not part of any mess' }, { status: 400 })
    }

    // Get the mess
    const mess = await Mess.findById(messId).populate('members.userId', 'name email')
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Check if user is admin of this mess
    if (mess.adminId.toString() !== userId && !mess.adminIds.some((id: any) => id.toString() === userId)) {
      return NextResponse.json({ message: 'You are not an admin of this mess' }, { status: 403 })
    }

    // Check if mess is started
    if (!mess.isStarted || mess.messStatus !== 'started') {
      return NextResponse.json({ message: 'Mess has not been started yet or already ended' }, { status: 400 })
    }

    // Calculate final overview
    const startDate = mess.startedAt
    const endDate = new Date()

    // Get meal attendance data for the entire mess period
    const mealAttendanceData = await MealAttendance.find({
      messId,
      date: { $gte: startDate, $lte: endDate }
    }).populate('userId', 'name email')

    // Get expense data
    const expenseData = await Expense.find({
      messId,
      date: { $gte: startDate, $lte: endDate }
    })

    // Get deposit data
    const depositData = await Deposit.find({
      messId,
      status: 'approved',
      date: { $gte: startDate, $lte: endDate }
    }).populate('userId', 'name email')

    // Calculate member-wise meal counts
    const memberMealStats: Record<string, {
      name: string
      email: string
      totalMeals: number
      breakfastCount: number
      lunchCount: number
      dinnerCount: number
      extraMeals: number
      joinedAt: Date
    }> = {}
    const activeMembers = mess.members.filter((member: any) => member.isActive && member.userId)

    // Initialize member stats
    activeMembers.forEach((member: any) => {
      memberMealStats[member.userId._id.toString()] = {
        name: member.userId.name,
        email: member.userId.email,
        totalMeals: 0,
        breakfastCount: 0,
        lunchCount: 0,
        dinnerCount: 0,
        extraMeals: 0,
        joinedAt: member.joinedAt
      }
    })

    // Get mess meal frequency to determine available slots
    const mealSlots = mess.mealFrequency === 3 
      ? ['breakfast', 'lunch', 'dinner']
      : ['lunch', 'dinner']

    // Calculate meal counts from attendance data
    // We need to iterate through each day and each meal slot
    const startDateStr = getBangladeshDateString(startDate)
    const endDateStr = getBangladeshDateString(endDate)
    
    const [sY, sM, sD] = startDateStr.split('-').map(Number)
    const [eY, eM, eD] = endDateStr.split('-').map(Number)
    
    const startUTC = new Date(Date.UTC(sY, sM - 1, sD))
    const endUTC = new Date(Date.UTC(eY, eM - 1, eD))
    
    const allDateStrings: string[] = []
    for (let d = new Date(startUTC); d <= endUTC; d.setUTCDate(d.getUTCDate() + 1)) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      allDateStrings.push(`${y}-${m}-${day}`)
    }

    // For each member, for each day, for each meal slot, calculate the meal count
    activeMembers.forEach((member: any) => {
      const memberId = member.userId._id.toString()
      
      allDateStrings.forEach(dateStr => {
        mealSlots.forEach(slot => {
          // Find attendance record for this member, date, and slot
          const attendance = mealAttendanceData.find((a: any) => 
            a.userId && a.userId._id.toString() === memberId && 
            getBangladeshDateString(new Date(a.date)) === dateStr &&
            a.mealSlot === slot
          )

          if (attendance) {
            // User has explicit attendance record
            if (attendance.isMealOn) {
              // Count standard meal
              memberMealStats[memberId].totalMeals += 1
              
              // Count by meal slot
              switch (slot) {
                case 'breakfast':
                  memberMealStats[memberId].breakfastCount += 1
                  break
                case 'lunch':
                  memberMealStats[memberId].lunchCount += 1
                  break
                case 'dinner':
                  memberMealStats[memberId].dinnerCount += 1
                  break
              }
            }
            
            // Count extra meals separately
            if (attendance.extraMealCount > 0) {
              memberMealStats[memberId].totalMeals += attendance.extraMealCount
              memberMealStats[memberId].extraMeals += attendance.extraMealCount
              
              // Add extra meals to slot-specific count
              switch (slot) {
                case 'breakfast':
                  memberMealStats[memberId].breakfastCount += attendance.extraMealCount
                  break
                case 'lunch':
                  memberMealStats[memberId].lunchCount += attendance.extraMealCount
                  break
                case 'dinner':
                  memberMealStats[memberId].dinnerCount += attendance.extraMealCount
                  break
              }
            }
          }
          // If no attendance record, don't count any meals (only count actual recorded meals)
        })
      })
    })

    // Calculate financial summary
    const totalExpenses = expenseData.reduce((sum: number, expense: any) => sum + expense.amount, 0)
    const totalDeposits = depositData.reduce((sum: number, deposit: any) => sum + deposit.amount, 0)
    const totalMealsServed = Object.values(memberMealStats).reduce((sum: number, member: any) => sum + member.totalMeals, 0)

    const finalOverview = {
      messInfo: {
        name: mess.name,
        messCode: mess.messCode,
        startedAt: startDate,
        endedAt: endDate,
        totalDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      },
      memberStats: Object.values(memberMealStats),
      financialSummary: {
        totalExpenses,
        totalDeposits,
        balance: totalDeposits - totalExpenses,
        totalMealsServed,
        averageCostPerMeal: totalMealsServed > 0 ? (totalExpenses / totalMealsServed) : 0
      },
      expenseBreakdown: expenseData.map((expense: any) => ({
        date: expense.date,
        itemName: expense.itemName,
        amount: expense.amount
      })),
      depositBreakdown: depositData.map((deposit: any) => ({
        date: deposit.date,
        amount: deposit.amount,
        memberName: deposit.userId ? deposit.userId.name : 'Deleted User',
        note: deposit.note
      }))
    }

    // End the mess
    mess.isStarted = false
    mess.endedAt = endDate
    mess.messStatus = 'ended'
    mess.currentCycle.endDate = endDate
    mess.currentCycle.isActive = false

    await mess.save()

    // Create notification for all members
    try {
      const notification = new Notification({
        messId: messId,
        type: 'mess_management',
        title: 'Mess Ended',
        message: `${mess.name} has been officially ended by the admin. Check the final overview for complete meal and financial summary.`,
        priority: 'high',
        relatedData: {
          messName: mess.name,
          endedAt: endDate,
          endedBy: user.name,
          totalMealsServed,
          totalExpenses,
          totalDeposits,
          finalOverview
        }
      })
      await notification.save()
    } catch (notificationError) {
      console.error('Error creating notification for mess end:', notificationError)
      // Don't fail the main operation if notification creation fails
    }


    return NextResponse.json({
      message: 'Mess ended successfully',
      finalOverview
    })

  } catch (error) {
    console.error('Error ending mess:', error)
    return NextResponse.json({ 
      message: 'Internal server error', 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}
