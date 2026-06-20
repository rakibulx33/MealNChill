import { isUserAdminOfMess } from '@/lib/adminUtils'
import connectDB from '@/lib/mongodb'
import Expense from '@/models/Expense'
import MealAttendance from '@/models/MealAttendance'
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
    if (!decoded || !decoded.messId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    const url = new URL(request.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const category = url.searchParams.get('category')

    // Build filter
    const filter: any = { messId: decoded.messId }
    
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }

    if (category && category !== 'all') {
      filter.category = category
    }

    const expenses = await Expense.find(filter)
      .sort({ date: -1 })
      .lean()

    // Calculate totals by category
    const categoryTotals = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ])

    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)

    // Calculate dynamic cost per meal for current period
    let costPerMeal = 0
    if (startDate && endDate) {
      // Get total meals for the specified period
      const totalMeals = await MealAttendance.aggregate([
        {
          $match: {
            messId: decoded.messId,
            date: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
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

      const totalMealsCount = totalMeals[0]?.totalMeals || 1
      costPerMeal = totalExpenses / totalMealsCount
    } else {
      // Calculate for current month if no date range specified
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const endOfMonth = new Date()
      endOfMonth.setMonth(endOfMonth.getMonth() + 1)
      endOfMonth.setDate(0)
      endOfMonth.setHours(23, 59, 59, 999)

      const totalMealsCurrentMonth = await MealAttendance.aggregate([
        {
          $match: {
            messId: decoded.messId,
            date: { $gte: startOfMonth, $lte: endOfMonth }
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

      const expensesCurrentMonth = await Expense.aggregate([
        {
          $match: {
            messId: decoded.messId,
            date: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ])

      const totalMealsCount = totalMealsCurrentMonth[0]?.totalMeals || 1
      const totalExpensesCurrentMonth = expensesCurrentMonth[0]?.total || 0
      costPerMeal = totalExpensesCurrentMonth / totalMealsCount
    }

    return NextResponse.json({
      expenses,
      categoryTotals,
      totalExpenses,
      costPerMeal: parseFloat(costPerMeal.toFixed(2))
    })
  } catch (error) {
    console.error('Error fetching expenses:', error)
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

    // Get user to find their mess and check admin status
    const user = await User.findById(decoded.userId)
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const isAdmin = await isUserAdminOfMess(decoded.userId, user.messId.toString())
    if (!isAdmin) {
      return NextResponse.json({ message: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { description, itemName, amount, date } = await request.json()

    // Support both 'description' and 'itemName' field names from different frontends
    const expenseItemName = itemName || description

    // Validate required fields
    if (!expenseItemName || !amount) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ message: 'Amount must be greater than 0' }, { status: 400 })
    }

    const expense = new Expense({
      messId: decoded.messId,
      itemName: expenseItemName,
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      enteredByUserId: decoded.userId
    })

    await expense.save()

    // Automatically deduct from total deposited amount for current cycle
    await Mess.findByIdAndUpdate(
      decoded.messId,
      { $inc: { totalDepositedAmountCurrentCycle: -parseFloat(amount) } }
    )

    return NextResponse.json({
      message: 'Expense added successfully and deducted from total deposit',
      expense
    })
  } catch (error) {
    console.error('Error adding expense:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
