import connectDB from '@/lib/mongodb'
import MemberSettlement from '@/models/MemberSettlement'
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const resolvedParams = await params
    const cycleId = resolvedParams.id

    const settlements = await MemberSettlement.find({
      billingCycleId: cycleId,
      messId: decoded.messId
    }).populate('userId', 'name email')

    const mappedSettlements = settlements.map((settlement: any) => {
      const sObj = settlement.toObject ? settlement.toObject() : settlement;
      return {
        ...sObj,
        userName: settlement.userId ? settlement.userId.name : 'Deleted User',
        userEmail: settlement.userId ? settlement.userId.email : ''
      }
    })

    mappedSettlements.sort((a: any, b: any) => a.userName.localeCompare(b.userName))

    return NextResponse.json({ settlements: mappedSettlements })
  } catch (error) {
    console.error('Error fetching member settlements:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
