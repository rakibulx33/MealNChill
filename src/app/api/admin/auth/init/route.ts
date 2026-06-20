import connectDB from '@/lib/mongodb'
import WebAdmin from '@/models/WebAdmin'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    // Check if this is being called with proper authorization
    const { initKey } = await req.json()
    const expectedKey = process.env.ADMIN_INIT_KEY || 'initialize-admin-2024'
    if (initKey !== expectedKey) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if admin already exists
    const adminCount = await WebAdmin.countDocuments()
    if (adminCount > 0) {
      return NextResponse.json(
        { message: 'Admin already exists' },
        { status: 400 }
      )
    }

    // Create default admin account securely
    const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex');

    const hashedPassword = await bcrypt.hash(defaultPassword, 12)
    const admin = await WebAdmin.create({
      username: defaultUsername,
      password: hashedPassword,
      email: 'admin@mealnchill.com',
      role: 'web_admin'
    })

    if (!process.env.DEFAULT_ADMIN_PASSWORD) {
      console.warn(`\n[SECURITY WARNING] Default admin account created with generated password: ${defaultPassword}`);
      console.warn('Please save this password securely and change it immediately!\n');
    }

    return NextResponse.json(
      { 
        message: 'Default admin account created successfully',
        admin: {
          username: admin.username,
          email: admin.email,
          role: admin.role
        }
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Initialize admin error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
