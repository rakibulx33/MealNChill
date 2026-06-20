import connectDB from '@/lib/mongodb'
import Mess from '@/models/Mess'
import User from '@/models/User'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
    } catch (jwtError) {
      return NextResponse.json(
        { message: 'Invalid or expired token' },
        { status: 401 }
      )
    }
    
    const userId = decoded.userId

    const resolvedParams = await params
    const messId = resolvedParams.id

    // Validate messId format (MongoDB ObjectId)
    if (!messId || !messId.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { message: 'Invalid mess ID format' },
        { status: 400 }
      )
    }

    // Get user to verify they belong to this mess
    const user = await User.findById(userId).maxTimeMS(5000)
    
    if (!user || !user.messId || user.messId.toString() !== messId) {
      return NextResponse.json(
        { message: 'Access denied - User not found or not member of this mess' },
        { status: 403 }
      )
    }

    // Get mess data with populated member details
    const mess = await Mess.findById(messId)
      .populate('members.userId', 'name email phone isAdmin')
      .populate('adminId', 'name email phone isAdmin')
      .populate('adminIds', 'name email phone isAdmin')
      .maxTimeMS(10000) // 10 second timeout for complex populate
    
    if (!mess) {
      return NextResponse.json(
        { message: 'Mess not found' },
        { status: 404 }
      )
    }

    // Check if user is admin
    const isAdmin = mess.adminIds?.some((adminId: any) => adminId._id.toString() === userId) ||
                   mess.adminId._id.toString() === userId

    if (!isAdmin) {
      return NextResponse.json(
        { message: 'Admin access required' },
        { status: 403 }
      )
    }

    // Create a comprehensive member list including all admins and members
    const allMembers: any[] = []
    
    // Add main admin (with null check)
    if (mess.adminId && mess.adminId._id) {
      allMembers.push({
        userId: mess.adminId._id,
        name: mess.adminId.name,
        email: mess.adminId.email,
        phone: mess.adminId.phone,
        role: 'admin',
        isActive: true,
        joinedAt: mess.createdAt || new Date(),
        isPending: false
      })
    }
    
    // Add additional admins (if they're not the main admin)
    if (mess.adminIds && mess.adminIds.length > 0) {
      mess.adminIds.forEach((admin: any) => {
        if (!admin || !admin._id) {
          return // Skip this admin
        }
        
        if (mess.adminId && mess.adminId._id && admin._id.toString() !== mess.adminId._id.toString()) {
          allMembers.push({
            userId: admin._id,
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            role: 'admin',
            isActive: true,
            joinedAt: mess.createdAt || new Date(),
            isPending: false
          })
        }
      })
    }
    
    // Add regular members (with comprehensive null checks)
    if (mess.members && mess.members.length > 0) {
      mess.members.forEach((member: any) => {
        if (!member || !member.userId || !member.userId._id) {
          return // Skip this member
        }
        
        try {
          // Skip if this user is already added as an admin
          const isAlreadyAdmin = allMembers.some(m => {
            return m.userId && member.userId._id && m.userId.toString() === member.userId._id.toString()
          })
          
          if (!isAlreadyAdmin) {
            allMembers.push({
              userId: member.userId._id,
              name: member.userId.name || 'Unknown',
              email: member.userId.email || '',
              phone: member.userId.phone || '',
              role: member.userId.isAdmin ? 'admin' : 'member',
              isActive: member.isActive,
              joinedAt: member.joinedAt,
              isPending: !member.isActive
            })
          }
        } catch (memberError) {
          // Skip member with error
          console.error(`Error processing member:`, memberError)
        }
      })
    }

    // Format the response data
    const messData = {
      id: mess._id,
      name: mess.name,
      messCode: mess.messCode,
      mealFrequency: mess.mealFrequency,
      adminIsActive: mess.adminIsActive,
      mealDeadlines: mess.mealDeadlines,
      members: allMembers
    }

    return NextResponse.json({ mess: messData })
  } catch (error) {
    console.error(`[MessAPI] Error:`, error)
    
    // Check for specific MongoDB errors
    let errorMessage = 'Internal server error'
    let statusCode = 500
    
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
        errorMessage = 'Database operation timed out - server may be overloaded'
      } else if (error.message.includes('connection') || error.message.includes('CONNECTION')) {
        errorMessage = 'Database connection failed - please try again'
      } else if (error.message.includes('JWT') || error.message.includes('token')) {
        errorMessage = 'Authentication error'
        statusCode = 401
      }
    }
    
    return NextResponse.json(
      { message: errorMessage },
      { status: statusCode }
    )
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const resolvedParams = await params
    const messId = resolvedParams.id

    // Get user to verify they belong to this mess
    const user = await User.findById(userId)
    if (!user || !user.messId || user.messId.toString() !== messId) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Get mess and verify admin access
    const mess = await Mess.findById(messId)
    if (!mess) {
      return NextResponse.json(
        { message: 'Mess not found' },
        { status: 404 }
      )
    }

    // Check if user is admin (co-admins list or main admin)
    const isAdmin = (Array.isArray(mess.adminIds) && mess.adminIds.some((id: any) => id.toString() === userId)) ||
                    (mess.adminId && mess.adminId.toString() === userId)

    if (!isAdmin) {
      return NextResponse.json(
        { message: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get update data from request body
    const { name, mealFrequency, mealDeadlines } = await req.json()

    // Validate data
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { message: 'Mess name is required' },
        { status: 400 }
      )
    }

    if (![2, 3].includes(mealFrequency)) {
      return NextResponse.json(
        { message: 'Meal frequency must be 2 or 3' },
        { status: 400 }
      )
    }

    // Validate meal deadlines if provided
    if (mealDeadlines) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
      
      if (mealFrequency === 3 && (!mealDeadlines.breakfast || !timeRegex.test(mealDeadlines.breakfast))) {
        return NextResponse.json(
          { message: 'Valid breakfast deadline time is required (HH:MM format)' },
          { status: 400 }
        )
      }
      
      if (!mealDeadlines.lunch || !timeRegex.test(mealDeadlines.lunch)) {
        return NextResponse.json(
          { message: 'Valid lunch deadline time is required (HH:MM format)' },
          { status: 400 }
        )
      }
      
      if (!mealDeadlines.dinner || !timeRegex.test(mealDeadlines.dinner)) {
        return NextResponse.json(
          { message: 'Valid dinner deadline time is required (HH:MM format)' },
          { status: 400 }
        )
      }
    }

    // Prepare update object
    const updateData: any = {
      name: name.trim(),
      mealFrequency: mealFrequency
    }

    // Add meal deadlines if provided
    if (mealDeadlines) {
      updateData.mealDeadlines = mealDeadlines
    }

    // Update mess using more explicit approach
    const updateResult = await Mess.findByIdAndUpdate(
      messId, 
      { $set: updateData }, 
      { new: true, runValidators: true }
    )
    
    if (!updateResult) {
      console.error('Failed to update mess - no result returned')
      return NextResponse.json(
        { message: 'Failed to update mess' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      message: 'Mess updated successfully',
      updatedData: updateData
    })
  } catch (error) {
    console.error('Update mess error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
