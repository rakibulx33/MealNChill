import connectDB from '@/lib/mongodb'
import Mess from '@/models/Mess'
import Notification from '@/models/Notification'
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
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Verify current user is admin
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ message: 'Admin privileges required' }, { status: 403 })
    }

    const { targetUserId, action } = await request.json()

    if (!['promote', 'demote'].includes(action)) {
      return NextResponse.json({ message: 'Invalid action. Only promote and demote are allowed.' }, { status: 400 })
    }

    // Verify target user exists and belongs to the mess
    const targetUser = await User.findOne({ _id: targetUserId, messId: decoded.messId })
    if (!targetUser) {
      return NextResponse.json({ message: 'Target user not found in this mess' }, { status: 404 })
    }

    // Get the mess
    const mess = await Mess.findById(decoded.messId)
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Initialize adminIds array if it doesn't exist (for backward compatibility)
    if (!Array.isArray(mess.adminIds)) {
      mess.adminIds = mess.adminId ? [mess.adminId] : []
    }

    if (action === 'promote') {
      // Check if user is already an admin
      if (targetUser.isAdmin) {
        return NextResponse.json({ message: 'User is already an admin' }, { status: 400 })
      }

      // Add target user as admin
      if (!mess.adminIds.includes(targetUserId)) {
        mess.adminIds.push(targetUserId)
        await mess.save()
      }

      await User.findByIdAndUpdate(targetUserId, { isAdmin: true })

      // Create notification
      await Notification.create({
        messId: decoded.messId,
        recipientId: targetUserId,
        type: 'admin_promotion',
        title: 'Promoted to Admin',
        message: `You have been promoted to admin of ${mess.name}. You now have administrative privileges.`,
        isRead: false
      })

      return NextResponse.json({
        message: 'User promoted to admin successfully',
        newAdmin: {
          id: targetUser._id,
          name: targetUser.name
        }
      })

    } else if (action === 'demote') {
      // Check if user is admin
      if (!targetUser.isAdmin) {
        return NextResponse.json({ message: 'User is not an admin' }, { status: 400 })
      }

      // Check if there will be at least one admin left
      const currentAdminCount = await User.countDocuments({ 
        messId: decoded.messId, 
        isAdmin: true 
      })
      
      if (currentAdminCount <= 1) {
        return NextResponse.json({ 
          message: 'Cannot demote the only admin. At least one admin must remain.' 
        }, { status: 400 })
      }

      // Remove user from admin list
      mess.adminIds = mess.adminIds.filter((id: any) => id.toString() !== targetUserId)
      await mess.save()

      await User.findByIdAndUpdate(targetUserId, { isAdmin: false })

      // Create notification
      await Notification.create({
        messId: decoded.messId,
        recipientId: targetUserId,
        type: 'admin_demotion',
        title: 'Admin Rights Removed',
        message: `Your admin rights for ${mess.name} have been removed. You are now a regular member.`,
        isRead: false
      })

      return NextResponse.json({
        message: 'Admin rights removed successfully'
      })
    }

  } catch (error) {
    console.error('Error in member role management:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
