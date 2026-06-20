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

    // Verify current user is admin (check token first, then database)
    const isAdminFromToken = decoded.role === 'admin'
    const adminUser = await User.findById(decoded.userId)
    if (!adminUser || (!isAdminFromToken && adminUser.role !== 'admin')) {
      return NextResponse.json({ message: 'Admin privileges required' }, { status: 403 })
    }

    const currentUserId = decoded.userId

    // Get the mess
    const mess = await Mess.findById(decoded.messId)
    if (!mess) {
      return NextResponse.json({ message: 'Mess not found' }, { status: 404 })
    }

    // Check if there are other admins
    const totalAdmins = await User.countDocuments({ 
      messId: decoded.messId, 
      isAdmin: true 
    })

    if (totalAdmins <= 1) {
      return NextResponse.json({ 
        message: 'Cannot remove admin rights. You are the only admin. Please transfer admin rights to another member first.' 
      }, { status: 400 })
    }

    // Remove current user from admin
    await User.findByIdAndUpdate(currentUserId, { isAdmin: false })

    // If using single admin field, need to assign it to another admin
    if (mess.adminId && mess.adminId.toString() === currentUserId) {
      const anotherAdmin = await User.findOne({
        messId: decoded.messId,
        isAdmin: true,
        _id: { $ne: currentUserId }
      })

      if (anotherAdmin) {
        mess.adminId = anotherAdmin._id
        await mess.save()
      }
    }

    // If using adminIds array, remove from array
    if (Array.isArray(mess.adminIds)) {
      mess.adminIds = mess.adminIds.filter((id: any) => id.toString() !== currentUserId)
      await mess.save()
    }

    // Get current user info for notification
    const currentUser = await User.findById(currentUserId)

    // Create notification for the user
    await Notification.create({
      messId: decoded.messId,
      recipientId: currentUserId,
      type: 'admin_self_demotion',
      title: 'Admin Rights Removed',
      message: `You have successfully removed your admin rights for ${mess.name}. You are now a regular member.`,
      isRead: false
    })

    // Notify other admins
    const otherAdmins = await User.find({
      messId: decoded.messId,
      isAdmin: true,
      _id: { $ne: currentUserId }
    })

    for (const admin of otherAdmins) {
      await Notification.create({
        messId: decoded.messId,
        recipientId: admin._id,
        type: 'admin_self_demotion',
        title: 'Admin Member Left',
        message: `${currentUser?.name} has removed their admin rights and is now a regular member.`,
        isRead: false
      })
    }

    return NextResponse.json({
      message: 'Admin rights removed successfully. You are now a regular member.'
    })

  } catch (error) {
    console.error('Error in self-demotion:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
