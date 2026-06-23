import connectDB from '@/lib/mongodb'
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

export async function POST(request: NextRequest) {
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

    const { targetUserId, action } = await request.json()

    if (!targetUserId || !action || !['promote', 'demote'].includes(action)) {
      return NextResponse.json({ message: 'Invalid request data' }, { status: 400 })
    }

    // Get current user and verify admin status
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
    }

    // Get the mess and verify admin belongs to it
    const mess = await Mess.findById(decoded.messId)
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Check if current user is admin of this mess
    const isMessAdmin = mess.adminId.toString() === decoded.userId || 
                       mess.adminIds?.some((adminId: any) => adminId.toString() === decoded.userId)
    
    if (!isMessAdmin) {
      return NextResponse.json({ message: 'You are not an admin of this mess' }, { status: 403 })
    }

    // Get target user
    const targetUser = await User.findById(targetUserId)
    if (!targetUser || targetUser.messId?.toString() !== decoded.messId) {
      return NextResponse.json({ message: 'Target user not found in this mess' }, { status: 404 })
    }

    // Check if target user is in mess members
    const isMember = mess.members.some((member: any) => 
      member.userId.toString() === targetUserId && member.isActive && member.isApproved
    )
    
    if (!isMember) {
      return NextResponse.json({ message: 'Target user is not an active member of this mess' }, { status: 400 })
    }

    if (action === 'promote') {
      // Promote to admin
      if (targetUser.isAdmin) {
        return NextResponse.json({ message: 'User is already an admin' }, { status: 400 })
      }

      // Update user to admin
      await User.findByIdAndUpdate(targetUserId, { 
        isAdmin: true,
        role: 'admin'
      })

      // Add to mess adminIds if not already there
      if (!mess.adminIds?.some((id: any) => id.toString() === targetUserId)) {
        await Mess.findByIdAndUpdate(decoded.messId, {
          $addToSet: { adminIds: targetUserId }
        })
      }

      return NextResponse.json({ 
        message: `${targetUser.name} has been promoted to admin successfully` 
      })

    } else if (action === 'demote') {
      // Demote from admin
      if (!targetUser.isAdmin) {
        return NextResponse.json({ message: 'User is not an admin' }, { status: 400 })
      }

      // Check if this is the main admin (adminId)
      if (mess.adminId.toString() === targetUserId) {
        return NextResponse.json({ 
          message: 'Cannot demote the main admin. Transfer ownership first.' 
        }, { status: 400 })
      }

      // Count total admins
      const totalAdmins = await User.countDocuments({
        messId: decoded.messId,
        isAdmin: true
      })

      if (totalAdmins <= 1) {
        return NextResponse.json({ 
          message: 'Cannot demote the last admin. There must be at least one admin.' 
        }, { status: 400 })
      }

      // Update user to member
      await User.findByIdAndUpdate(targetUserId, { 
        isAdmin: false,
        role: 'member'
      })

      // Remove from mess adminIds
      await Mess.findByIdAndUpdate(decoded.messId, {
        $pull: { adminIds: targetUserId }
      })

      return NextResponse.json({ 
        message: `${targetUser.name} has been demoted to member successfully` 
      })
    }

  } catch (error) {
    console.error('Error in admin transfer:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
