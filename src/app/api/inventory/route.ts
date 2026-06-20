import { isUserAdminOfMess } from '@/lib/adminUtils'
import { logInventoryChange } from '@/lib/inventoryLogger'
import connectDB from '@/lib/mongodb'
import Inventory from '@/models/Inventory'
import User from '@/models/User'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

// Helper function to handle floating point precision issues
const parseQuantity = (value: string | number): number => {
  const parsed = typeof value === 'string' ? parseFloat(value) : value
  // Round to 2 decimal places to avoid floating point precision issues
  return Math.round(parsed * 100) / 100
}

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
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    // Get user's current mess membership status from database
    // This handles cases where JWT token is stale (created before mess approval)
    const user = await User.findById(decoded.userId)
    
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User is not part of any mess' }, { status: 403 })
    }

    const inventory = await Inventory.find({ messId: user.messId })
      .sort({ itemName: 1 })
      .lean()

    return NextResponse.json({ inventory })
  } catch (error) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
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
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Get user to find their mess and check admin status
    const user = await User.findById(decoded.userId)
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const isAdmin = await isUserAdminOfMess(decoded.userId, user.messId.toString())
    if (!isAdmin) {
      return NextResponse.json({ message: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { itemName, quantity, unit, category, lowStockThreshold } = await request.json()

    // Validate required fields
    if (!itemName || !quantity || !unit) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Check if item already exists
    let existingItem = await Inventory.findOne({
      messId: user.messId,
      itemName: { $regex: new RegExp(`^${itemName}$`, 'i') },
      unit: unit.toLowerCase()
    })

    let savedItem
    let action: 'ADD' | 'UPDATE' = 'ADD'
    let previousQuantity = 0

    if (existingItem) {
      // Update existing item
      previousQuantity = existingItem.quantity
      existingItem.quantity = parseQuantity(existingItem.quantity + parseQuantity(quantity))
      existingItem.category = category || existingItem.category
      if (lowStockThreshold !== undefined) existingItem.lowStockThreshold = parseQuantity(lowStockThreshold)
      existingItem.updatedByUserId = decoded.userId
      savedItem = await existingItem.save()
      action = 'UPDATE'
    } else {
      // Create new item
      const inventoryItem = new Inventory({
        messId: user.messId,
        itemName,
        quantity: parseQuantity(quantity),
        unit: unit.toLowerCase(),
        category: category || 'Other',
        lowStockThreshold: lowStockThreshold !== undefined ? parseQuantity(lowStockThreshold) : 10,
        updatedByUserId: decoded.userId
      })
      savedItem = await inventoryItem.save()
    }

    // Log the change
    await logInventoryChange({
      messId: user.messId.toString(),
      inventoryItemId: savedItem._id.toString(),
      itemName: savedItem.itemName,
      action,
      previousQuantity,
      newQuantity: savedItem.quantity,
      unit: savedItem.unit,
      category: savedItem.category,
      reason: action === 'ADD' ? 'New item added' : `Added ${quantity} ${unit}`,
      performedBy: decoded.userId
    })

    return NextResponse.json({
      message: action === 'ADD' ? 'Inventory item added successfully' : 'Inventory item updated successfully',
      item: savedItem
    })
  } catch (error) {
    console.error('Error adding inventory item:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB()

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ message: 'No token provided' }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Get user to find their mess and check admin status
    const user = await User.findById(decoded.userId)
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const isAdmin = await isUserAdminOfMess(decoded.userId, user.messId.toString())
    if (!isAdmin) {
      return NextResponse.json({ message: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { id, quantity, itemName, category, unit, lowStockThreshold } = await request.json()

    if (!id || quantity === undefined) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    const item = await Inventory.findOne({ _id: id, messId: user.messId })

    if (!item) {
      return NextResponse.json({ message: 'Inventory item not found' }, { status: 404 })
    }

    const previousQuantity = item.quantity
    const previousItemName = item.itemName
    const previousCategory = item.category
    const previousUnit = item.unit
    const previousLowStockThreshold = item.lowStockThreshold

    // Update the item with new values
    if (itemName) item.itemName = itemName.trim()
    if (category) item.category = category
    if (unit) item.unit = unit.toLowerCase()
    if (lowStockThreshold !== undefined) item.lowStockThreshold = parseQuantity(lowStockThreshold)
    item.quantity = parseQuantity(quantity)
    item.updatedByUserId = decoded.userId
    const savedItem = await item.save()

    // Create more detailed reason for logging
    let reason = 'Item updated:'
    const changes = []
    if (previousQuantity !== savedItem.quantity) {
      changes.push(`quantity from ${previousQuantity} to ${savedItem.quantity} ${savedItem.unit}`)
    }
    if (itemName && previousItemName !== savedItem.itemName) {
      changes.push(`name from "${previousItemName}" to "${savedItem.itemName}"`)
    }
    if (category && previousCategory !== savedItem.category) {
      changes.push(`category from "${previousCategory}" to "${savedItem.category}"`)
    }
    if (unit && previousUnit !== savedItem.unit) {
      changes.push(`unit from "${previousUnit}" to "${savedItem.unit}"`)
    }
    if (lowStockThreshold !== undefined && previousLowStockThreshold !== savedItem.lowStockThreshold) {
      changes.push(`low stock alert from ${previousLowStockThreshold} to ${savedItem.lowStockThreshold}`)
    }
    if (changes.length > 0) {
      reason += ' ' + changes.join(', ')
    } else {
      reason = `Quantity updated from ${previousQuantity} to ${savedItem.quantity}`
    }

    // Log the change
    await logInventoryChange({
      messId: user.messId.toString(),
      inventoryItemId: savedItem._id.toString(),
      itemName: savedItem.itemName,
      action: 'UPDATE',
      previousQuantity,
      newQuantity: savedItem.quantity,
      unit: savedItem.unit,
      category: savedItem.category,
      reason,
      performedBy: decoded.userId
    })

    return NextResponse.json({
      message: 'Inventory updated successfully',
      item: savedItem
    })
  } catch (error) {
    console.error('Error updating inventory:', error)
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
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Get user to find their mess and check admin status
    const user = await User.findById(decoded.userId)
    if (!user || !user.messId) {
      return NextResponse.json({ message: 'User not found or not in a mess' }, { status: 404 })
    }

    const isAdmin = await isUserAdminOfMess(decoded.userId, user.messId.toString())
    if (!isAdmin) {
      return NextResponse.json({ message: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const url = new URL(request.url)
    const itemId = url.searchParams.get('id')

    if (!itemId) {
      return NextResponse.json({ message: 'Item ID is required' }, { status: 400 })
    }

    const item = await Inventory.findOne({ _id: itemId, messId: user.messId })

    if (!item) {
      return NextResponse.json({ message: 'Inventory item not found' }, { status: 404 })
    }

    // Log the deletion before removing
    await logInventoryChange({
      messId: user.messId.toString(),
      inventoryItemId: item._id.toString(),
      itemName: item.itemName,
      action: 'REMOVE',
      previousQuantity: item.quantity,
      newQuantity: 0,
      unit: item.unit,
      category: item.category,
      reason: `Item deleted - had ${item.quantity} ${item.unit} in stock`,
      performedBy: decoded.userId
    })

    // Delete the item
    await Inventory.deleteOne({ _id: itemId, messId: user.messId })

    return NextResponse.json({
      message: 'Inventory item deleted successfully',
      deletedItem: {
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit
      }
    })
  } catch (error) {
    console.error('Error deleting inventory item:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
