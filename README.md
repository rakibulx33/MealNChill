# MealNChill - Comprehensive Meal Management System

<div align="center">

![MealNChill Logo](https://img.shields.io/badge/MealNChill-🍽️-blue?style=for-the-badge&logo=restaurant&logoColor=white)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0-green?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

_Making meal management simple, efficient, and chill!_ 🍽️✨

</div>

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [User Roles & Permissions](#-user-roles--permissions)
- [Features Deep Dive](#-features-deep-dive)
- [Development Guidelines](#-development-guidelines)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

## 🌟 Overview

**MealNChill** is a modern, full-stack meal management system designed specifically for mess facilities, hostels, shared accommodations, and group living spaces. Built with Next.js 15, TypeScript, and MongoDB, it provides a comprehensive solution for managing meals, tracking attendance, monitoring inventory, and handling financial operations.

### Why MealNChill?

- **🎯 Purpose-Built**: Designed specifically for mess and communal dining management
- **👥 Multi-User**: Supports multiple users with role-based access control
- **📱 Responsive**: Works seamlessly on desktop, tablet, and mobile devices
- **⚡ Real-time**: Live updates and notifications for all activities
- **🔐 Secure**: JWT-based authentication with proper authorization
- **📊 Analytics**: Comprehensive reporting and analytics dashboard

## ✨ Key Features

### 🍽️ Meal Management

- **Meal Planning**: Create and manage meal routines with detailed descriptions
- **Attendance Tracking**: Mark meal attendance with deadline management
- **Extra Meals**: Handle additional meal requests and guest meals
- **Meal Preparation**: Track meal preparation status and inventory deduction

### 📦 Inventory Management

- **Stock Monitoring**: Real-time inventory tracking with low-stock alerts
- **Automatic Deduction**: Inventory automatically reduces when meals are prepared
- **Restocking**: Easy restocking with audit trails
- **Categories**: Organize items by categories (vegetables, meat, dairy, etc.)

### 💰 Financial Management

- **Deposit Tracking**: Monitor member deposits and payment history
- **Expense Management**: Track all mess-related expenses
- **Billing Cycles**: Automated billing cycle management
- **Financial Reports**: Detailed financial analytics and reports
- **Due Reminders**: Automated notifications for pending payments

### 👥 User Management

- **Role-Based Access**: Admin and member roles with specific permissions
- **Member Profiles**: Detailed user profiles with contact information
- **Mess Setup**: Easy mess creation and member invitation system
- **Admin Controls**: Comprehensive admin panel for mess management

### � Notification System

- **Real-time Alerts**: Instant notifications for important events
- **Meal Status Updates**: Notifications for meal attendance changes
- **Financial Alerts**: Payment reminders and deposit confirmations
- **Inventory Warnings**: Low stock and restock notifications

### 📊 Analytics & Reporting

- **Dashboard Overview**: Comprehensive stats and quick insights
- **Financial Analytics**: Monthly trends and expense breakdowns
- **Meal Statistics**: Attendance patterns and meal preferences
- **Member Analytics**: Individual member consumption and payments

## 🛠 Technology Stack

### Frontend

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **Language**: [TypeScript 5.0](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 3.0](https://tailwindcss.com/)
- **Icons**: Material-UI Icons
- **State Management**: React Hooks (useState, useEffect)

### Backend

- **Runtime**: [Node.js](https://nodejs.org/)
- **API Routes**: Next.js API Routes with Express-style handlers
- **Authentication**: JWT (JSON Web Tokens) with bcryptjs
- **Validation**: Custom validation middleware

### Database

- **Database**: [MongoDB 6.0](https://www.mongodb.com/)
- **ODM**: [Mongoose](https://mongoosejs.com/)
- **Schema Design**: Normalized data structure with references

### Development Tools

- **Package Manager**: npm
- **Linting**: ESLint with Next.js configuration
- **Type Checking**: TypeScript compiler
- **Development Server**: Next.js development server with hot reload

## 📋 Prerequisites

Before installing MealNChill, ensure you have the following installed:

- **Node.js**: Version 18.0 or higher
- **npm**: Version 8.0 or higher
- **MongoDB**: Version 6.0 or higher (local or cloud)
- **Git**: For cloning the repository

### System Requirements

- **RAM**: Minimum 4GB, Recommended 8GB
- **Storage**: Minimum 2GB free space
- **Network**: Internet connection for dependencies and MongoDB Atlas (if used)

## � Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/mealnchill.git
cd mealnchill
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/mealnchill

# JWT Secret Key (generate a secure random string)
JWT_SECRET=your_super_secure_jwt_secret_key_here_minimum_32_characters

# Admin Initialization Key (used to create the initial admin account)
ADMIN_INIT_KEY=your_secure_admin_initialization_key

# Environment
NODE_ENV=development
```

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 🏗️ Project Structure

```
MealNChill/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   ├── deposits/      # Deposit management
│   │   │   ├── inventory/     # Inventory management
│   │   │   ├── meal-*         # Meal-related endpoints
│   │   │   └── mess/          # Mess management
│   │   ├── auth/              # Authentication pages
│   │   ├── dashboard/         # Main dashboard
│   │   └── mess-setup/        # Mess setup page
│   ├── components/            # React components
│   │   ├── Billing.tsx        # Billing management
│   │   ├── FinancialOverview.tsx # Financial dashboard
│   │   ├── Inventory.tsx      # Inventory management
│   │   ├── MealAttendance.tsx # Attendance tracking
│   │   ├── MealRoutine.tsx    # Meal planning
│   │   ├── Notifications.tsx  # Notification system
│   │   └── ui/               # UI components
│   ├── lib/                   # Utility functions
│   ├── models/               # Database models
│   └── types/                # TypeScript definitions
├── public/                    # Static assets
└── ...config files
```

## 🔐 Authentication Flow

1. **New Users**: Register → Login → Mess Setup → Dashboard
2. **Existing Users**: Login → Dashboard (if in mess) or Mess Setup
3. **Admin Users**: Full access to mess management features
4. **Member Users**: Access to personal dashboard and meal features

## 🗄️ Database Schema

### User Model

- Basic information (name, email, phone)
- Authentication credentials
- Mess association and role
- Account status and timestamps

### Future Models

- Mess facilities
- Meal plans and menus
- Billing and payments
- Member activities

## 🔧 API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/user/profile` - Get user profile

### Mess Management (Coming Soon)

- `POST /api/mess/create` - Create new mess
- `POST /api/mess/join` - Join existing mess
- `GET /api/mess/details` - Get mess information

## 🎨 UI Components

The application uses a modern, responsive design with:

- Clean authentication forms
- Interactive dashboard cards
- Role-based navigation
- Responsive grid layouts
- Custom color schemes

## 🔒 Security Features

- Password hashing with bcryptjs
- JWT token-based authentication
- Input validation and sanitization
- Protected API routes
- Environment variable security

## 🚦 Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## 🚀 Deployment

### Production Deployment (Vercel - Recommended)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy to Vercel
vercel

# 3. Configure environment variables in Vercel dashboard
# 4. Connect MongoDB Atlas for production database
```

### Environment Variables for Production

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mealnchill
JWT_SECRET=production-secure-secret-key-64-characters-minimum
ADMIN_INIT_KEY=production-secure-admin-init-key
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Contact the development team
- Check the documentation

---

**MealNChill** - Making meal management simple and efficient! 🍽️
