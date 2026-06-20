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

export async function POST(request: NextRequest) {
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

    const currentUserId = decoded.userId
    const { reason, transferToUserId, confirmAction } = await request.json()

    // Get current user to check their actual mess status
    const currentUser = await User.findById(currentUserId)
    if (!currentUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    if (!currentUser.messId) {
      return NextResponse.json({ message: 'You are not in any mess' }, { status: 400 })
    }

    // Get mess info
    const mess = await Mess.findById(currentUser.messId)
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Check if user is admin
    if (currentUser.isAdmin) {
      // Get total number of members and admins
      const totalMembers = await User.countDocuments({ 
        messId: currentUser.messId 
      })
      
      const totalAdmins = await User.countDocuments({ 
        messId: currentUser.messId, 
        isAdmin: true 
      })

      // Case 1: Admin is the only member in the mess
      if (totalMembers === 1) {
        if (confirmAction === 'DELETE_MESS') {
          // Delete the entire mess and let admin leave
          return await deleteMessAndRemoveAdmin(currentUser, mess, currentUserId)
        } else {
          // Return warning message for frontend to show confirmation
          return NextResponse.json({ 
            requiresConfirmation: true,
            action: 'DELETE_MESS',
            message: 'You are the only member in this mess. Leaving will permanently delete the mess and all its data. This action cannot be undone.',
            totalMembers: totalMembers
          }, { status: 200 })
        }
      }

      // Case 2: Admin with other members but no other admins
      if (totalAdmins === 1 && totalMembers > 1) {
        if (transferToUserId && confirmAction === 'TRANSFER_AND_LEAVE') {
          // Transfer admin rights and then leave
          return await transferAdminshipAndLeave(currentUser, mess, currentUserId, transferToUserId)
        } else {
          // Return list of members for frontend to show transfer options
          const otherMembers = await User.find({ 
            messId: currentUser.messId, 
            _id: { $ne: currentUserId } 
          }).select('_id name email')
          
          return NextResponse.json({ 
            requiresTransfer: true,
            action: 'TRANSFER_AND_LEAVE',
            message: 'You are the only admin. Please select a member to transfer admin rights to before leaving.',
            otherMembers: otherMembers,
            totalMembers: totalMembers
          }, { status: 200 })
        }
      }

      // Case 3: Admin with other admins - can leave immediately
      if (totalAdmins > 1) {
        return await processImmediateLeave(currentUser, mess, currentUserId)
      }
    }

    // For regular members, check if there's already a pending request
    const existingRequest = await LeaveRequest.findOne({
      userId: currentUserId,
      messId: currentUser.messId,
      status: 'pending'
    })

    if (existingRequest) {
      return NextResponse.json({ 
        message: 'You already have a pending leave request. Please wait for admin approval.' 
      }, { status: 400 })
    }

    // Create new leave request
    const leaveRequest = new LeaveRequest({
      userId: currentUserId,
      messId: currentUser.messId,
      reason: reason?.trim() || '',
      status: 'pending'
    })

    await leaveRequest.save()

    // Notify all admins about the leave request
    const admins = await User.find({
      messId: currentUser.messId,
      isAdmin: true
    })

    for (const admin of admins) {
      await Notification.create({
        messId: currentUser.messId,
        recipientId: admin._id,
        type: 'leave_request',
        title: 'Leave Request Submitted',
        message: `${currentUser.name} has requested to leave the mess.${reason ? ` Reason: ${reason}` : ''}`,
        isRead: false,
        relatedData: {
          leaveRequestId: leaveRequest._id,
          requestingUserId: currentUserId,
          requestingUserName: currentUser.name
        }
      })
    }

    return NextResponse.json({
      message: 'Leave request submitted successfully. Please wait for admin approval.',
      requestId: leaveRequest._id
    })

  } catch (error) {
    console.error('Error creating leave request:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to delete mess when admin is the only member
async function deleteMessAndRemoveAdmin(currentUser: any, mess: any, currentUserId: string) {
  try {
    // Import all models that need cleanup
    const models = {
      Notification: (await import('@/models/Notification')).default,
      LeaveRequest: (await import('@/models/LeaveRequest')).default,
      MemberSettlement: (await import('@/models/MemberSettlement')).default,
      MealRoutine: (await import('@/models/MealRoutine')).default,
      MealAttendance: (await import('@/models/MealAttendance')).default,
      InventoryRecord: (await import('@/models/InventoryRecord')).default,
      Expense: (await import('@/models/Expense')).default,
      Inventory: (await import('@/models/Inventory')).default,
      Deposit: (await import('@/models/Deposit')).default,
      BillingCycle: (await import('@/models/BillingCycle')).default,
    }

    // Delete all related data in parallel for better performance
    await Promise.all([
      models.Notification.deleteMany({ messId: currentUser.messId }),
      models.LeaveRequest.deleteMany({ messId: currentUser.messId }),
      models.MemberSettlement.deleteMany({ messId: currentUser.messId }),
      models.MealRoutine.deleteMany({ messId: currentUser.messId }),
      models.MealAttendance.deleteMany({ messId: currentUser.messId }),
      models.InventoryRecord.deleteMany({ messId: currentUser.messId }),
      models.Expense.deleteMany({ messId: currentUser.messId }),
      models.Inventory.deleteMany({ messId: currentUser.messId }),
      models.Deposit.deleteMany({ messId: currentUser.messId }),
      models.BillingCycle.deleteMany({ messId: currentUser.messId }),
    ])

    // Delete the mess itself
    await Mess.findByIdAndDelete(currentUser.messId)

    // Remove user from mess
    await User.findByIdAndUpdate(currentUserId, { 
      messId: null, 
      isAdmin: false 
    })

    // Generate a new token with updated user info
    const newToken = jwt.sign(
      { 
        userId: currentUser._id,
        email: currentUser.email,
        messId: null,
        isAdmin: false
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      message: 'You have successfully left and deleted the mess. You can create a new mess or join an existing one.',
      token: newToken,
      messDeleted: true
    })

  } catch (error) {
    console.error('Error deleting mess:', error)
    throw error
  }
}

// Helper function to transfer adminship and then leave
async function transferAdminshipAndLeave(currentUser: any, mess: any, currentUserId: string, newAdminId: string) {
  try {
    // Verify the new admin exists and is a member of this mess
    const newAdmin = await User.findOne({ 
      _id: newAdminId, 
      messId: currentUser.messId 
    })
    
    if (!newAdmin) {
      return NextResponse.json({ 
        message: 'Selected user not found or not a member of this mess' 
      }, { status: 400 })
    }

    // Transfer admin rights
    await User.findByIdAndUpdate(newAdminId, { isAdmin: true })

    // Update mess admin references
    mess.adminId = newAdminId
    if (Array.isArray(mess.adminIds)) {
      // Remove current admin and add new admin
      mess.adminIds = mess.adminIds.filter((id: any) => id.toString() !== currentUserId)
      if (!mess.adminIds.includes(newAdminId)) {
        mess.adminIds.push(newAdminId)
      }
    } else {
      mess.adminIds = [newAdminId]
    }
    await mess.save()

    // Remove current user from mess
    mess.members = mess.members.filter((member: any) => member.userId.toString() !== currentUserId)
    await mess.save()

    await User.findByIdAndUpdate(currentUserId, { 
      messId: null, 
      isAdmin: false 
    })

    // Create notifications
    await Notification.create({
      messId: currentUser.messId,
      recipientId: newAdminId,
      type: 'admin_promotion',
      title: 'Promoted to Admin',
      message: `You have been promoted to admin of ${mess.name} by ${currentUser.name} who has left the mess. You now have administrative privileges.`,
      isRead: false
    })

    // Notify other members about the change
    const otherMembers = await User.find({
      messId: currentUser.messId,
      _id: { $ne: newAdminId }
    })

    for (const member of otherMembers) {
      await Notification.create({
        messId: currentUser.messId,
        recipientId: member._id,
        type: 'admin_change',
        title: 'Admin Change',
        message: `${currentUser.name} has left the mess and transferred admin rights to ${newAdmin.name}.`,
        isRead: false
      })
    }

    // Generate a new token for the leaving user
    const newToken = jwt.sign(
      { 
        userId: currentUser._id,
        email: currentUser.email,
        messId: null,
        isAdmin: false
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      message: `You have successfully transferred admin rights to ${newAdmin.name} and left the mess. You can now join another mess or create a new one.`,
      token: newToken,
      adminTransferred: true,
      newAdminName: newAdmin.name
    })

  } catch (error) {
    console.error('Error transferring adminship:', error)
    throw error
  }
}

// Helper function for immediate leave (for admins)
async function processImmediateLeave(currentUser: any, mess: any, currentUserId: string) {
  try {
    // If leaving admin was the main admin, assign it to another admin
    if (mess.adminId && mess.adminId.toString() === currentUserId) {
      const anotherAdmin = await User.findOne({
        messId: currentUser.messId,
        isAdmin: true,
        _id: { $ne: currentUserId }
      })

      if (anotherAdmin) {
        mess.adminId = anotherAdmin._id
        await mess.save()
      }
    }

    // Remove from adminIds array if it exists
    if (Array.isArray(mess.adminIds)) {
      mess.adminIds = mess.adminIds.filter((id: any) => id.toString() !== currentUserId)
      await mess.save()
    }

    // Remove user from mess members array
    mess.members = mess.members.filter((member: any) => member.userId.toString() !== currentUserId)
    await mess.save()

    // Remove user from mess
    await User.findByIdAndUpdate(currentUserId, { 
      messId: null, 
      isAdmin: false 
    })

    // Create notification for remaining admins
    const remainingAdmins = await User.find({
      messId: currentUser.messId,
      isAdmin: true
    })

    for (const admin of remainingAdmins) {
      await Notification.create({
        messId: currentUser.messId,
        recipientId: admin._id,
        type: 'member_left',
        title: 'Admin Left Mess',
        message: `${currentUser.name} (Admin) has left the mess.`,
        isRead: false
      })
    }

    // Generate a new token with updated user info (no messId)
    const newToken = jwt.sign(
      { 
        userId: currentUser._id,
        email: currentUser.email,
        messId: null,
        isAdmin: false
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      message: 'You have successfully left the mess. You can join another mess or create a new one.',
      token: newToken
    })

  } catch (error) {
    console.error('Error processing immediate leave:', error)
    throw error
  }
}
