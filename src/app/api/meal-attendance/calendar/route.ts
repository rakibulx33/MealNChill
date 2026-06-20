import connectDB from '@/lib/mongodb'
import MealAttendance from '@/models/MealAttendance'
import User from '@/models/User'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const userId = searchParams.get('userId') // Optional - for specific user, 'all' for all users

    // Verify token and get user info
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Connect to database
    await connectDB()

    // Get user's mess information
    const user = await User.findById(decoded.userId).populate('messId')
    if (!user || !user.messId) {
      return NextResponse.json({ error: 'User not in any mess' }, { status: 400 })
    }

    // Get mess information
    const mess = user.messId as any
    if (!mess) {
      return NextResponse.json({ error: 'Mess not found' }, { status: 404 })
    }

    // Validate date parameters
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 })
    }

    // Convert string dates to Date objects with proper timezone handling
    // Frontend sends dates in YYYY-MM-DD format, treat as Bangladesh timezone
    const startDateObj = new Date(startDate + 'T00:00:00+06:00')
    const endDateObj = new Date(endDate + 'T23:59:59+06:00')

    // Create date range filter
    const dateFilter = {
      date: {
        $gte: startDateObj,
        $lte: endDateObj
      }
    }

    // Build user filter
    let userFilter = {}
    if (userId && userId !== 'all') {
      userFilter = { userId: userId }
    } else {
      // Get all active members of the mess - add safety check
      if (!mess.members || !Array.isArray(mess.members)) {
        return NextResponse.json({ error: 'Mess has no members' }, { status: 400 })
      }
      
      const activeMembers = mess.members.filter((member: any) => member.isActive).map((member: any) => member.userId)
      userFilter = { userId: { $in: activeMembers } }
    }

    // Combine filters
    const combinedFilter = {
      ...dateFilter,
      ...userFilter
    }

    // Fetch meal attendance data
    const attendanceData = await MealAttendance.find(combinedFilter)
      .populate('userId', 'name email')
      .sort({ date: -1, userId: 1 })
      .lean()

    // Get all users for name mapping
    const allUsers = await User.find(
      userId && userId !== 'all' 
        ? { _id: userId }
        : { _id: { $in: mess.members.filter((m: any) => m.isActive).map((m: any) => m.userId) } }
    ).select('_id name email').lean()

    const userMap = new Map()
    allUsers.forEach((user: any) => {
      userMap.set(user._id.toString(), user.name)
    })

    // Process data into calendar format
    const calendarData: any[] = []
    
    // Create a map to organize data by date and user
    const dataMap = new Map()
    
    attendanceData.forEach((record: any) => {
      // Convert Date object to string in YYYY-MM-DD format for frontend
      const dateStr = record.date instanceof Date 
        ? record.date.toISOString().split('T')[0]
        : record.date
      const userIdStr = record.userId ? record.userId._id.toString() : 'deleted'
      const key = `${dateStr}-${userIdStr}`
      
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          date: dateStr,
          userId: userIdStr,
          userName: userMap.get(userIdStr) || (record.userId ? record.userId.name : 'Deleted User'),
          breakfast: { status: false, extra: 0 },
          lunch: { status: false, extra: 0 },
          dinner: { status: false, extra: 0 },
          totalMeals: 0
        })
      }
      
      const dayData = dataMap.get(key)
      
      // Update meal data based on meal slot
      if (record.mealSlot === 'breakfast') {
        dayData.breakfast = {
          status: record.isMealOn,
          extra: record.extraMealCount || 0
        }
      } else if (record.mealSlot === 'lunch') {
        dayData.lunch = {
          status: record.isMealOn,
          extra: record.extraMealCount || 0
        }
      } else if (record.mealSlot === 'dinner') {
        dayData.dinner = {
          status: record.isMealOn,
          extra: record.extraMealCount || 0
        }
      }
    })

    // Recalculate total meals for all entries after processing all records
    dataMap.forEach((dayData) => {
      dayData.totalMeals = 
        (dayData.breakfast.status ? 1 : 0) + (dayData.breakfast.extra || 0) +
        (dayData.lunch.status ? 1 : 0) + (dayData.lunch.extra || 0) +
        (dayData.dinner.status ? 1 : 0) + (dayData.dinner.extra || 0)
    })

    // Convert map to array
    calendarData.push(...Array.from(dataMap.values()))

    // If specific user is requested but no data found, create empty records for date range
    if (userId && userId !== 'all' && calendarData.length === 0) {
      const userName = userMap.get(userId) || 'Unknown User'
      const start = new Date(startDate)
      const end = new Date(endDate)
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0]
        calendarData.push({
          date: dateStr,
          userId: userId,
          userName: userName,
          breakfast: { status: false, extra: 0 },
          lunch: { status: false, extra: 0 },
          dinner: { status: false, extra: 0 },
          totalMeals: 0
        })
      }
    }

    // Sort by date (newest first) and then by user name
    calendarData.sort((a, b) => {
      const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime()
      if (dateCompare !== 0) return dateCompare
      return a.userName.localeCompare(b.userName)
    })

    console.log('✅ Final calendar data:', { 
      totalRecords: calendarData.length,
      sampleData: calendarData.slice(0, 2)
    })

    return NextResponse.json({
      success: true,
      calendarData,
      dateRange: {
        startDate,
        endDate
      },
      totalRecords: calendarData.length
    })

  } catch (error) {
    console.error('Error fetching meal calendar data:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch meal calendar data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    )
  }
}
