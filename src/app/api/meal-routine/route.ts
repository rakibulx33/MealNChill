import connectDB from '@/lib/mongodb'
import MealRoutine from '@/models/MealRoutine'
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

export async function GET(req: NextRequest) {
  try {
    await connectDB()

    // Get token from Authorization header
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json(
        { message: 'No token provided' },
        { status: 401 }
      )
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
    const userId = decoded.userId

    // Get user and mess info
    const user = await User.findById(userId).populate('messId')
    if (!user || !user.messId) {
      return NextResponse.json(
        { message: 'User not found or not part of a mess' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { message: 'Start date and end date are required' },
        { status: 400 }
      )
    }

    // Parse dates with Bangladesh timezone
    const startDateString = startDate + 'T00:00:00+06:00'
    const endDateString = endDate + 'T23:59:59+06:00'
    
    const routines = await MealRoutine.find({
      messId: user.messId,
      date: {
        $gte: new Date(startDateString),
        $lte: new Date(endDateString)
      },
      isActive: true
    }).sort({ date: 1, mealSlot: 1 })

    return NextResponse.json({
      routines: routines.map(routine => ({
        id: routine._id,
        date: getBangladeshDateString(routine.date),
        mealSlot: routine.mealSlot,
        mealName: routine.mealName,
        mealDescription: routine.mealDescription || ''
      }))
    })
  } catch (error) {
    console.error('Get meal routine error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    // Get token from Authorization header
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json(
        { message: 'No token provided' },
        { status: 401 }
      )
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
    const userId = decoded.userId

    // Check if user is admin
    const user = await User.findById(userId).populate('messId')
    
    if (!user || !user.messId || user.role !== 'admin') {
      return NextResponse.json(
        { message: 'Only admin can create/update meal routines' },
        { status: 403 }
      )
    }

    const requestBody = await req.json()
    
    const { 
      date, 
      mealSlot, 
      mealName, 
      mealDescription = ''
    } = requestBody

    // Validate required fields
    if (!date || !mealSlot || !mealName) {
      return NextResponse.json(
        { message: 'Date, meal slot, and meal name are required' },
        { status: 400 }
      )
    }

    // Validate meal slot
    if (!['breakfast', 'lunch', 'dinner'].includes(mealSlot)) {
      return NextResponse.json(
        { message: 'Invalid meal slot' },
        { status: 400 }
      )
    }

    // Update or create meal routine using Bangladesh timezone
    const dateString = date + 'T00:00:00+06:00' // Add BD timezone offset
    const normalizedDate = new Date(dateString)
    
    const mealRoutine = await MealRoutine.findOneAndUpdate(
      {
        messId: user.messId,
        date: normalizedDate,
        mealSlot: mealSlot
      },
      {
        messId: user.messId,
        date: normalizedDate,
        mealSlot: mealSlot,
        mealName: mealName.trim(),
        mealDescription: mealDescription.trim(),
        isActive: true
      },
      { 
        upsert: true, 
        new: true 
      }
    )

    return NextResponse.json({
      message: 'Meal routine saved successfully',
      routine: {
        id: mealRoutine._id,
        date: getBangladeshDateString(mealRoutine.date),
        mealSlot: mealRoutine.mealSlot,
        mealName: mealRoutine.mealName,
        mealDescription: mealRoutine.mealDescription
      }
    })
  } catch (error) {
    console.error('Save meal routine error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
