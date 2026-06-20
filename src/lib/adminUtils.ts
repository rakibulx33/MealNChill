import Mess from '@/models/Mess'
import User from '@/models/User'

/**
 * Centralized admin validation utility
 * Checks all admin fields for consistency and returns authoritative admin status
 */
export const isUserAdminOfMess = async (userId: string, messId: string): Promise<boolean> => {
  try {
    // Get user and mess data
    const [user, mess] = await Promise.all([
      User.findById(userId),
      Mess.findById(messId)
    ])

    if (!user || !mess) {
      return false
    }

    // Check if user belongs to the mess
    if (user.messId?.toString() !== messId) {
      return false
    }

    // Check all admin conditions (any of these makes user an admin)
    const conditions = [
      // 1. User has isAdmin flag
      user.isAdmin === true,
      
      // 2. User is the main admin
      mess.adminId && mess.adminId.toString() === userId,
      
      // 3. User is in adminIds array
      mess.adminIds && Array.isArray(mess.adminIds) && 
      mess.adminIds.some((adminId: any) => adminId.toString() === userId)
    ]

    return conditions.some(condition => condition)
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

/**
 * Get comprehensive admin status for a user
 */
export const getAdminStatus = async (userId: string, messId: string) => {
  try {
    const [user, mess] = await Promise.all([
      User.findById(userId),
      Mess.findById(messId)
    ])

    if (!user || !mess) {
      return {
        isAdmin: false,
        isMainAdmin: false,
        inAdminIds: false,
        hasAdminFlag: false,
        inconsistencies: []
      }
    }

    const hasAdminFlag = user.isAdmin === true
    const isMainAdmin = mess.adminId && mess.adminId.toString() === userId
    const inAdminIds = mess.adminIds && Array.isArray(mess.adminIds) && 
                      mess.adminIds.some((adminId: any) => adminId.toString() === userId)

    const isAdmin = hasAdminFlag || isMainAdmin || inAdminIds

    // Check for inconsistencies
    const inconsistencies = []
    if (hasAdminFlag && !inAdminIds) {
      inconsistencies.push('User has admin flag but not in adminIds array')
    }
    if (inAdminIds && !hasAdminFlag) {
      inconsistencies.push('User in adminIds but admin flag is false')
    }
    if (isMainAdmin && !hasAdminFlag) {
      inconsistencies.push('User is main admin but admin flag is false')
    }
    if (isMainAdmin && !inAdminIds) {
      inconsistencies.push('Main admin not in adminIds array')
    }

    return {
      isAdmin,
      isMainAdmin,
      inAdminIds,
      hasAdminFlag,
      inconsistencies
    }
  } catch (error) {
    console.error('Error getting admin status:', error)
    return {
      isAdmin: false,
      isMainAdmin: false,
      inAdminIds: false,
      hasAdminFlag: false,
      inconsistencies: ['Error checking status']
    }
  }
}

/**
 * Sync admin status across all fields
 * Ensures consistency between user.isAdmin, mess.adminId, and mess.adminIds
 */
export const syncAdminStatus = async (userId: string, messId: string, shouldBeAdmin: boolean) => {
  try {
    const [user, mess] = await Promise.all([
      User.findById(userId),
      Mess.findById(messId)
    ])

    if (!user || !mess) {
      throw new Error('User or mess not found')
    }

    if (shouldBeAdmin) {
      // Make user admin - sync all fields
      await User.findByIdAndUpdate(userId, { 
        isAdmin: true,
        role: 'admin'
      })

      // Add to adminIds if not already there
      if (!mess.adminIds?.some((adminId: any) => adminId.toString() === userId)) {
        await Mess.findByIdAndUpdate(messId, {
          $addToSet: { adminIds: userId }
        })
      }
    } else {
      // Check if this is the main admin BEFORE making any changes
      if (mess.adminId && mess.adminId.toString() === userId) {
        // This requires special handling - main admin transfer
        throw new Error('Cannot remove main admin without transferring ownership')
      }

      // Remove admin status - sync all fields
      await User.findByIdAndUpdate(userId, { 
        isAdmin: false,
        role: 'member'
      })

      // Remove from adminIds
      await Mess.findByIdAndUpdate(messId, {
        $pull: { adminIds: userId }
      })
    }

    return true
  } catch (error) {
    console.error('Error syncing admin status:', error)
    throw error
  }
}
