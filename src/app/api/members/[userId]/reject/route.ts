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

// POST - Reject member join request
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

    // Find the user to reject
    const userToReject = await User.findById(userId)
    if (!userToReject) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    // Find the mess
    const mess = await Mess.findById(decoded.messId)
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Check if the user is in the mess members array (pending or approved)
    const memberIndex = mess.members.findIndex((member: any) => 
      member.userId.toString() === userId
    )

    if (memberIndex === -1) {
      return NextResponse.json({ message: 'User is not requesting to join this mess' }, { status: 400 })
    }

    // Check if the user is already approved (shouldn't reject approved members)
    if (mess.members[memberIndex].isApproved) {
      return NextResponse.json({ message: 'Cannot reject an already approved member. Use remove member instead.' }, { status: 400 })
    }

    // Remove the member from the mess (reject the join request)
    mess.members.splice(memberIndex, 1)
    await mess.save()

    // Remove mess association from user if they had one
    if (userToReject.messId?.toString() === decoded.messId) {
      await User.findByIdAndUpdate(userId, { 
        messId: null,
        isAdmin: false 
      })
    }

    // Send notification to the rejected user
    await Notification.create({
      messId: decoded.messId,
      recipientId: userToReject._id,
      type: 'general',
      title: 'Join Request Rejected',
      message: `Your request to join ${mess.name} has been rejected by ${currentUser.name}. You can try joining another mess or create your own.`,
      isRead: false
    })

    // Notify other admins about the rejection
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
        title: 'Member Rejected',
        message: `${userToReject.name}'s request to join the mess has been rejected by ${currentUser.name}.`,
        isRead: false
      })
    }

    return NextResponse.json({
      message: 'Member rejected and removed from mess successfully'
    })

  } catch (error) {
    console.error('Error rejecting member:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
