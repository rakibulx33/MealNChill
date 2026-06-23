import connectDB from '@/lib/mongodb'
import Deposit from '@/models/Deposit'
import MealAttendance from '@/models/MealAttendance'
import Mess from '@/models/Mess'
import User from '@/models/User'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
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
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    // Get current user to check admin status and get messId from user if not in token
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    // Use messId from token first, then fallback to user's messId
    const messId = decoded.messId || currentUser.messId
    if (!messId) {
      return NextResponse.json({ message: 'User not part of any mess' }, { status: 400 })
    }

    // Check if this is an admin request for approvals management
    const { searchParams } = new URL(request.url)
    const includeAll = searchParams.get('includeAll') === 'true'
    
    const isAdminRequest = currentUser?.isAdmin && includeAll
    const isUserAdmin = currentUser?.isAdmin || false

    // Get the mess with populated member details
    const mess = await Mess.findById(messId)
      .populate({
        path: 'members.userId',
        select: 'name email phone isAdmin joinedAt isActive'
      })
      .populate({
        path: 'members.approvedBy',
        select: 'name'
      })
      .populate({
        path: 'adminId',
        select: 'name email phone isAdmin'
      })
      .populate({
        path: 'adminIds',
        select: 'name email phone isAdmin'
      })
      .lean()

    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    const messData = mess as any

    // Create a set of all user IDs from the mess for easy lookup
    const allMemberUserIds = new Set<string>()
    
    // Add main admin
    if (messData.adminId) {
      allMemberUserIds.add(messData.adminId._id.toString())
    }
    
    // Add additional admins
    if (messData.adminIds && messData.adminIds.length > 0) {
      messData.adminIds.forEach((admin: any) => {
        if (admin && admin._id) {
          allMemberUserIds.add(admin._id.toString())
        }
      })
    }

    // Add members from the members array
    messData.members.forEach((member: any) => {
      if (member.userId && member.userId._id) {
        allMemberUserIds.add(member.userId._id.toString())
      }
    })

    // Create a comprehensive list of all people associated with the mess
    const allPeople: any[] = []
    
    // Add main admin if exists
    if (messData.adminId) {
      allPeople.push({
        userId: messData.adminId,
        isActive: true,
        isApproved: true, // Admins are always approved
        joinedAt: messData.createdAt || new Date(),
        isPending: false, // Admins are never pending
        role: 'admin'
      })
    }
    
    // Add additional admins
    if (messData.adminIds && messData.adminIds.length > 0) {
      messData.adminIds.forEach((admin: any) => {
        if (admin && admin._id && admin._id.toString() !== messData.adminId._id.toString()) {
          allPeople.push({
            userId: admin,
            isActive: true,
            isApproved: true, // Admins are always approved
            joinedAt: messData.createdAt || new Date(),
            isPending: false, // Admins are never pending
            role: 'admin'
          })
        }
      })
    }
    
    // Add regular members
    messData.members.forEach((member: any) => {
      if (member.userId && member.userId._id) {
        // Skip if this person is already added as an admin
        const isAlreadyAdded = allPeople.some(person => 
          person.userId._id.toString() === member.userId._id.toString()
        )
        
        if (!isAlreadyAdded) {
          allPeople.push({
            userId: member.userId,
            isActive: member.isActive !== false, // Default to true if not explicitly false
            isApproved: member.isApproved !== false, // Default to true if not explicitly false
            joinedAt: member.joinedAt,
            isPending: member.isApproved === false || member.isActive === false, // Only pending if explicitly false
            role: member.userId.isAdmin ? 'admin' : 'member',
            approvedAt: member.approvedAt,
            approvedBy: member.approvedBy
          })
        }
      }
    })

    // Process members with their approval status and stats
    const membersWithStats = await Promise.all(
      allPeople
        .filter((person: any) => {
          if (!person.userId) return false
          
          // For admin requests with includeAll=true (approvals management), include all members including pending
          if (isAdminRequest) {
            return true
          }
          
          // For regular member list viewing (both admin and member users)
          // Simply show all active members regardless of pending status
          // This ensures members can always see who's in the mess
          return person.isActive !== false
        })
        .map(async (person: any) => {
          const user = person.userId
          
          // Get total meals taken since joining (all time)
          const totalMealsTaken = await MealAttendance.aggregate([
            {
              $match: {
                messId: new mongoose.Types.ObjectId(messId),
                userId: new mongoose.Types.ObjectId(user._id)
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

          // Get total money paid till now (all approved deposits)
          const totalMoneyPaid = await Deposit.aggregate([
            {
              $match: {
                messId: new mongoose.Types.ObjectId(messId),
                userId: new mongoose.Types.ObjectId(user._id),
                status: 'approved'
              }
            },
            {
              $group: {
                _id: null,
                totalAmount: { $sum: '$amount' }
              }
            }
          ])

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            phone: user.phone,
            totalMealsTaken: totalMealsTaken[0]?.totalMeals || 0,
            totalMoneyPaid: totalMoneyPaid[0]?.totalAmount || 0,
            role: user.isAdmin ? 'admin' : 'member',
            joinedAt: person.joinedAt,
            isApproved: person.isApproved !== false, // Default to true if undefined
            isPending: person.isPending || false,
            isActive: person.isActive !== false, // Default to true if undefined
            approvedAt: person.approvedAt,
            approvedBy: person.approvedBy ? {
              id: person.approvedBy._id,
              name: person.approvedBy.name
            } : null
          }
        })
    )

    return NextResponse.json({
      members: membersWithStats,
      totalMembers: membersWithStats.length
    })
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ message: 'No token provided' }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    const messId = decoded.messId || currentUser.messId
    if (!messId) {
      return NextResponse.json({ message: 'User not part of any mess' }, { status: 400 })
    }

    const { userId } = await request.json()

    // Check if user exists and belongs to the mess
    const user = await User.findOne({ _id: userId, messId: messId })
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    // Cannot remove admin
    if (user.isAdmin) {
      return NextResponse.json({ message: 'Cannot remove admin user' }, { status: 400 })
    }

    // Remove user from mess members array
    const mess = await Mess.findById(messId)
    if (mess) {
      mess.members = mess.members.filter((member: any) => member.userId.toString() !== userId)
      await mess.save()
    }

    // Remove user from mess (set messId to null and reset admin status)
    await User.findByIdAndUpdate(userId, { 
      messId: null,
      isAdmin: false,
      role: 'member'
    })

    return NextResponse.json({ message: 'Member removed successfully' })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
