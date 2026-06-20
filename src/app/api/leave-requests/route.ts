import connectDB from '@/lib/mongodb'
import LeaveRequest from '@/models/LeaveRequest'
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

// GET - Fetch all leave requests for the mess
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

    // Verify user is admin
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
    }

    // Get all leave requests for the mess
    const leaveRequests = await LeaveRequest.find({ messId: decoded.messId })
      .populate('userId', 'name email phone')
      .populate('reviewedBy', 'name')
      .sort({ requestedAt: -1 })
      .lean()

    const formattedRequests = leaveRequests.map(request => ({
      id: request._id,
      user: {
        id: request.userId._id,
        name: request.userId.name,
        email: request.userId.email,
        phone: request.userId.phone
      },
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reviewedBy: request.reviewedBy ? {
        id: request.reviewedBy._id,
        name: request.reviewedBy.name
      } : null,
      adminNote: request.adminNote
    }))

    return NextResponse.json({ leaveRequests: formattedRequests })

  } catch (error) {
    console.error('Error fetching leave requests:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

// POST - Approve or reject a leave request
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

    // Verify user is admin
    const currentUser = await User.findById(decoded.userId)
    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
    }

    const { requestId, action, adminNote } = await request.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ message: 'Invalid action. Must be approve or reject.' }, { status: 400 })
    }

    // Find the leave request
    const leaveRequest = await LeaveRequest.findById(requestId).populate('userId')
    if (!leaveRequest) {
      return NextResponse.json({ message: 'Leave request not found' }, { status: 404 })
    }

    if (leaveRequest.messId.toString() !== decoded.messId) {
      return NextResponse.json({ message: 'Leave request not found in your mess' }, { status: 404 })
    }

    if (leaveRequest.status !== 'pending') {
      return NextResponse.json({ message: 'Leave request has already been processed' }, { status: 400 })
    }

    const requestingUser = leaveRequest.userId

    if (action === 'approve') {
      // Approve the leave request and process the leave
      leaveRequest.status = 'approved'
      leaveRequest.reviewedAt = new Date()
      leaveRequest.reviewedBy = currentUser._id
      leaveRequest.adminNote = adminNote || ''
      await leaveRequest.save()

      // Get mess to update
      const mess = await Mess.findById(decoded.messId)
      if (mess) {
        // Remove user from mess members array
        mess.members = mess.members.filter((member: any) => 
          member.userId.toString() !== requestingUser._id.toString()
        )
        await mess.save()
      }

      // Remove user from mess
      await User.findByIdAndUpdate(requestingUser._id, { 
        messId: null, 
        isAdmin: false 
      })

      // Notify the user about approval (use original messId since user was just removed)
      await Notification.create({
        messId: decoded.messId,
        recipientId: requestingUser._id,
        type: 'leave_request_approved',
        title: 'Leave Request Approved',
        message: `Your leave request has been approved by ${currentUser.name}. You have been removed from the mess.${adminNote ? ` Admin note: ${adminNote}` : ''}`,
        isRead: false
      })

      // Notify other admins
      const otherAdmins = await User.find({
        messId: decoded.messId,
        isAdmin: true,
        _id: { $ne: currentUser._id }
      })

      for (const admin of otherAdmins) {
        await Notification.create({
          messId: decoded.messId,
          recipientId: admin._id,
          type: 'member_left',
          title: 'Member Left Mess',
          message: `${requestingUser.name} has left the mess (leave request approved by ${currentUser.name}).`,
          isRead: false
        })
      }

      return NextResponse.json({
        message: 'Leave request approved successfully. Member has been removed from the mess.',
        status: 'approved'
      })

    } else { // reject
      // Reject the leave request
      leaveRequest.status = 'rejected'
      leaveRequest.reviewedAt = new Date()
      leaveRequest.reviewedBy = currentUser._id
      leaveRequest.adminNote = adminNote || ''
      await leaveRequest.save()

      // Notify the user about rejection
      await Notification.create({
        messId: decoded.messId,
        recipientId: requestingUser._id,
        type: 'leave_request_rejected',
        title: 'Leave Request Rejected',
        message: `Your leave request has been rejected by ${currentUser.name}.${adminNote ? ` Reason: ${adminNote}` : ''}`,
        isRead: false
      })

      return NextResponse.json({
        message: 'Leave request rejected successfully.',
        status: 'rejected'
      })
    }

  } catch (error) {
    console.error('Error processing leave request:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
