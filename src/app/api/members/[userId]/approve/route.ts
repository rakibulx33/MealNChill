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

// POST - Approve member join request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    // Verify current user is admin
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
    }

    const { userId } = await params

    // Find the user to approve
    const userToApprove = await User.findById(userId)
    if (!userToApprove) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    // Find the mess and update the member's approval status
    const mess = await Mess.findById(decoded.messId)
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Find the member in the mess and approve them
    const memberIndex = mess.members.findIndex((member: any) => 
      member.userId.toString() === userId
    )

    if (memberIndex === -1) {
      return NextResponse.json({ message: 'User is not requesting to join this mess' }, { status: 404 })
    }

    if (mess.members[memberIndex].isApproved) {
      return NextResponse.json({ message: 'Member is already approved' }, { status: 400 })
    }

    // Approve the member
    mess.members[memberIndex].isApproved = true
    mess.members[memberIndex].isActive = true // Make them an active member
    mess.members[memberIndex].approvedAt = new Date()
    mess.members[memberIndex].approvedBy = currentUser._id
    await mess.save()

    // Update user's messId to officially join them to the mess
    await User.findByIdAndUpdate(userId, { 
      messId: decoded.messId
    })

    // Send notification to the approved user
    await Notification.create({
      messId: decoded.messId,
      recipientId: userToApprove._id,
      type: 'general',
      title: 'Join Request Approved',
      message: `Your request to join ${mess.name} has been approved by ${currentUser.name}. You can now access all mess features.`,
      isRead: false
    })

    // Notify other admins about the approval
    const otherAdmins = await User.find({
      messId: decoded.messId,
      isAdmin: true,
      _id: { $ne: currentUser._id }
    })

    for (const admin of otherAdmins) {
      await Notification.create({
        messId: decoded.messId,
        recipientId: admin._id,
        type: 'general',
        title: 'Member Approved',
        message: `${userToApprove.name} has been approved to join the mess by ${currentUser.name}.`,
        isRead: false
      })
    }

    return NextResponse.json({
      message: 'Member approved successfully',
      member: {
        id: userToApprove._id,
        name: userToApprove.name,
        email: userToApprove.email,
        isApproved: true
      }
    })

  } catch (error) {
    console.error('Error approving member:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
