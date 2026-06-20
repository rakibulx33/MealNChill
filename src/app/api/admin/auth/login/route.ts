import connectDB from '@/lib/mongodb'
import WebAdmin from '@/models/WebAdmin'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const { username, password } = await req.json()

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        { message: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Check if this is the first time setup (no admin exists)
    const adminCount = await WebAdmin.countDocuments()
    
    if (adminCount === 0) {
      // Create default admin account securely
      const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex');

      const hashedPassword = await bcrypt.hash(defaultPassword, 12)
      await WebAdmin.create({
        username: defaultUsername,
        password: hashedPassword,
        email: 'admin@mealnchill.com',
        role: 'web_admin'
      })

      if (!process.env.DEFAULT_ADMIN_PASSWORD) {
        console.warn(`\n[SECURITY WARNING] Default admin account created with generated password: ${defaultPassword}`);
        console.warn('Please save this password securely and change it immediately!\n');
      }
    }

    // Find admin by username
    const admin = await WebAdmin.findOne({ username: username.toLowerCase() })
    if (!admin) {
      return NextResponse.json(
        { message: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // Check if admin is active
    if (!admin.isActive) {
      return NextResponse.json(
        { message: 'Account is deactivated. Please contact support.' },
        { status: 401 }
      )
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { message: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // Update last login
    await WebAdmin.findByIdAndUpdate(admin._id, { lastLogin: new Date() })

    // Create JWT token
    const token = jwt.sign(
      { 
        adminId: admin._id,
        username: admin.username,
        role: admin.role
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    )

    // Return admin data (excluding password) and token
    const adminData = {
      id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      lastLogin: admin.lastLogin
    }

    // Create response with secure cookies
    const response = NextResponse.json(
      { 
        message: 'Login successful',
        token,
        admin: adminData
      },
      { status: 200 }
    )

    // Set secure httpOnly cookies for server-side middleware
    response.cookies.set('adminToken', token, {
      httpOnly: false, // Need to be accessible to client for API calls
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 // 24 hours
    })

    response.cookies.set('adminData', JSON.stringify(adminData), {
      httpOnly: false, // Need to be accessible to client
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 // 24 hours
    })

    return response
  } catch (error) {
    console.error('Web Admin login error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
