'use client'

import { LightbulbOutlined, MonetizationOn } from '@mui/icons-material'
import { useCallback, useEffect, useState } from 'react'

interface FinancialOverviewProps {
  messId: string
  isAdmin: boolean
}

interface FinancialData {
  totalDeposits: number
  totalExpenses: number
  currentBalance: number
  pendingDeposits: number
  activeMembers: number
  averageDepositPerMember: number // This will actually store average expense per member
  monthlyStats: {
    month: string
    deposits: number
    expenses: number
    balance: number
  }[]
}

interface PendingDeposit {
  _id: string
  userId: {
    _id: string
    name: string
    email: string
  }
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

interface DepositReport {
  period: string
  summary: {
    totalDeposits: number
    totalTransactions: number
    averageDepositAmount: number
    dateRange: {
      startDate: string
      endDate: string
    }
  }
  transactions: {
    id: string
    amount: number
    user: {
      id: string
      name: string
      email: string
    }
    approvedBy: {
      id: string
      name: string
    } | null
    createdAt: string
    approvedAt: string
  }[]
  userSummary: {
    _id: string
    totalAmount: number
    depositCount: number
    lastDepositDate: string
    name: string
    email: string
  }[]
  monthlyTrends: {
    year: number
    month: number
    monthName: string
    period: string
    totalAmount: number
    transactionCount: number
    averagePerTransaction: number
    periodStart: string
    periodEnd: string
  }[]
}

export default function FinancialOverview({ messId, isAdmin }: FinancialOverviewProps) {
  const [financialData, setFinancialData] = useState<FinancialData | null>(null)
  const [pendingDeposits, setPendingDeposits] = useState<PendingDeposit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('current-month')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingDepositId, setProcessingDepositId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null)
  
  // Reports states
  const [showReportsModal, setShowReportsModal] = useState(false)
  const [reportData, setReportData] = useState<DepositReport | null>(null)
  const [reportPeriod, setReportPeriod] = useState('all-time')
  const [reportLoading, setReportLoading] = useState(false)

  const fetchFinancialData = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = localStorage.getItem('token')
      
      // Fetch deposits data
      const depositsResponse = await fetch('/api/deposits', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      // Fetch expenses data from cost sheet
      const expensesResponse = await fetch('/api/expenses', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      // Fetch mess data for member count
      const messResponse = await fetch(`/api/mess/${messId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      let totalDeposits = 0
      let totalExpenses = 0
      let pendingDeposits = 0
      let activeMembers = 0

      // Get total deposited amount
      if (depositsResponse.ok) {
        const depositsData = await depositsResponse.json()
        
        // Calculate total deposits from approved deposits
        const approvedDeposits = depositsData.deposits?.filter((d: any) => d.status === 'approved') || []
        totalDeposits = approvedDeposits.reduce((sum: number, deposit: any) => sum + deposit.amount, 0)
        
        // Count pending deposits
        const pendingCount = depositsData.deposits?.filter((d: any) => d.status === 'pending').length || 0
        pendingDeposits = pendingCount
      }

      // Get total expenses from cost sheet
      if (expensesResponse.ok) {
        const expensesData = await expensesResponse.json()
        totalExpenses = expensesData.totalExpenses || 0
      }

      // Get member count
      if (messResponse.ok) {
        const messData = await messResponse.json()
        activeMembers = messData.mess.members?.filter((m: any) => m.isActive !== false).length || 0
      }

      // Calculate current balance (deposits - expenses)
      const currentBalance = totalDeposits - totalExpenses

      // Calculate average expense per member
      const averageExpensePerMember = activeMembers > 0 ? totalExpenses / activeMembers : 0

      setFinancialData({
        totalDeposits,
        totalExpenses,
        currentBalance,
        pendingDeposits,
        activeMembers,
        averageDepositPerMember: averageExpensePerMember, // This is now average expense per member
        monthlyStats: [
          {
            month: 'Current Month',
            deposits: totalDeposits,
            expenses: totalExpenses,
            balance: currentBalance
          }
        ]
      })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to fetch financial data' })
    } finally {
      setIsLoading(false)
    }
  }, [messId, selectedPeriod])

  const fetchPendingDeposits = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/deposits?status=pending&messId=${messId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPendingDeposits(data.deposits || [])
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to fetch pending deposits' })
    }
  }, [messId, isAdmin])

  useEffect(() => {
    fetchFinancialData()
    if (isAdmin) {
      fetchPendingDeposits()
    }
  }, [fetchFinancialData, fetchPendingDeposits, isAdmin])

  const fetchReportData = async (period: string = reportPeriod) => {
    try {
      setReportLoading(true)
      
      const token = localStorage.getItem('token')
      if (!token) {
        setMessage({ type: 'error', text: 'Please log in to view reports' })
        return
      }
      
      const response = await fetch(`/api/deposits/reports?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        setReportData(data.data)
      } else {
        setMessage({ type: 'error', text: 'Failed to fetch report data' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error loading report data' })
    } finally {
      setReportLoading(false)
    }
  }

  const handleViewReports = () => {
    setShowReportsModal(true)
    fetchReportData()
  }

  const handleApproveDeposit = async (depositId: string) => {
    setProcessingDepositId(depositId)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/deposits/${depositId}/approve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve'
        }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Deposit approved successfully!' })
        fetchPendingDeposits()
        fetchFinancialData()
      } else {
        const errorData = await response.json()
        setMessage({ type: 'error', text: errorData.message || 'Failed to approve deposit' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to approve deposit. Please try again.' })
    } finally {
      setProcessingDepositId(null)
      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleRejectDeposit = async (depositId: string) => {
    setProcessingDepositId(depositId)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/deposits/${depositId}/reject`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rejectionReason: 'Rejected by admin' }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Deposit rejected successfully!' })
        fetchPendingDeposits()
        fetchFinancialData()
      } else {
        const errorData = await response.json()
        setMessage({ type: 'error', text: errorData.message || 'Failed to reject deposit' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reject deposit. Please try again.' })
    } finally {
      setProcessingDepositId(null)
      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleAddDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid deposit amount' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: Number(depositAmount),
        }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Deposit submitted successfully! Please wait for admin approval.' })
        setShowDepositModal(false)
        setDepositAmount('')
        fetchFinancialData() // Refresh data
        if (isAdmin) {
          fetchPendingDeposits() // Refresh pending deposits if admin
        }
      } else {
        const errorData = await response.json()
        setMessage({ type: 'error', text: errorData.message || 'Failed to submit deposit' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to submit deposit. Please try again.' })
    } finally {
      setIsSubmitting(false)
      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!financialData) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-gray-500 text-6xl mb-4">
          <MonetizationOn style={{ fontSize: '6rem' }} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Financial Data</h2>
        <p className="text-gray-600">Unable to load financial information.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Message Banner */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${
          message.type === 'success' 
            ? 'bg-green-100 border border-green-400 text-green-700' 
            : message.type === 'error' 
            ? 'bg-red-100 border border-red-400 text-red-700' 
            : 'bg-blue-100 border border-blue-400 text-blue-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {message.type === 'success' && (
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {message.type === 'error' && (
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="ml-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Financial Overview</h1>
            <p className="text-gray-600 mt-1">Complete financial summary for your mess</p>
          </div>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-white"
          >
            <option value="current-month">Current Month</option>
            <option value="last-month">Last Month</option>
            <option value="last-3-months">Last 3 Months</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-50 text-sm font-medium">Total Deposits</p>
              <p className="text-3xl font-bold">৳{financialData.totalDeposits.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-300 bg-opacity-40 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-rose-400 to-rose-500 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-rose-50 text-sm font-medium">Total Expenses</p>
              <p className="text-3xl font-bold">৳{financialData.totalExpenses.toLocaleString()}</p>
            </div>
            <div className="bg-rose-300 bg-opacity-40 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-sky-400 to-sky-500 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sky-50 text-sm font-medium">Current Balance</p>
              <p className="text-3xl font-bold">৳{financialData.currentBalance.toLocaleString()}</p>
            </div>
            <div className="bg-sky-300 bg-opacity-40 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-violet-400 to-violet-500 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-violet-50 text-sm font-medium">Avg. Expense per Member</p>
              <p className="text-3xl font-bold">৳{financialData.averageDepositPerMember.toLocaleString()}</p>
            </div>
            <div className="bg-violet-300 bg-opacity-40 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Active Members</span>
              <span className="font-semibold text-gray-900">{financialData.activeMembers}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Pending Deposits</span>
              <span className="font-semibold text-orange-600">{financialData.pendingDeposits}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Expense Ratio</span>
              <span className="font-semibold text-gray-900">
                {financialData.totalDeposits > 0 ? ((financialData.totalExpenses / financialData.totalDeposits) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Savings Rate</span>
              <span className="font-semibold text-green-600">
                {financialData.totalDeposits > 0 ? ((financialData.currentBalance / financialData.totalDeposits) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Health</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Budget Utilization</span>
                <span className="font-semibold text-gray-900">
                  {financialData.totalDeposits > 0 ? ((financialData.totalExpenses / financialData.totalDeposits) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-sky-500 h-2 rounded-full" 
                  style={{ width: `${financialData.totalDeposits > 0 ? Math.min((financialData.totalExpenses / financialData.totalDeposits) * 100, 100) : 0}%` }}
                ></div>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                <LightbulbOutlined className="mr-1 text-yellow-500" />
                Financial Tips
              </h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Monitor expenses to stay within budget</li>
                <li>• Encourage timely deposit submissions</li>
                <li>• Keep some balance for emergencies</li>
                <li>• Review monthly spending patterns</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Section - Pending Deposits */}
      {isAdmin && pendingDeposits.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Pending Deposits ({pendingDeposits.length})
          </h3>
          <div className="space-y-4">
            {pendingDeposits.map((deposit) => (
              <div key={deposit._id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                  <div className="mb-3 sm:mb-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.51-1.31c-.562-.649-1.413-1.076-2.353-1.253V5z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{deposit.userId.name}</p>
                        <p className="text-sm text-gray-600">{deposit.userId.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                    <div className="text-right sm:text-left">
                      <p className="text-2xl font-bold text-gray-900">৳{deposit.amount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(deposit.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleApproveDeposit(deposit._id)}
                        disabled={processingDepositId === deposit._id}
                        className="flex items-center justify-center px-3 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm"
                      >
                        {processingDepositId === deposit._id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Approve
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRejectDeposit(deposit._id)}
                        disabled={processingDepositId === deposit._id}
                        className="flex items-center justify-center px-3 py-2 bg-rose-500 text-white text-sm rounded-lg hover:bg-rose-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm"
                      >
                        {processingDepositId === deposit._id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Reject
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={() => setShowDepositModal(true)}
            className="flex items-center justify-center px-4 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-md"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            Add Deposit
          </button>
          
          <button 
            onClick={handleViewReports}
            className="flex items-center justify-center px-4 py-3 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors shadow-md"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            View Reports
          </button>
        </div>
      </div>

      {/* Add Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Deposit</h3>
              <button
                onClick={() => {
                  setShowDepositModal(false)
                  setDepositAmount('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deposit Amount (৳)
              </label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                min="1"
                step="1"
              />
            </div>

            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Your deposit will be pending until approved by an admin.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDepositModal(false)
                  setDepositAmount('')
                }}
                className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleAddDeposit}
                disabled={isSubmitting || !depositAmount}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm"
              >
                {isSubmitting ? 'Submitting...' : 'Add Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      {showReportsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Deposit Reports</h3>
              <button
                onClick={() => {
                  setShowReportsModal(false)
                  setReportData(null)
                }}
                className="text-gray-400 hover:text-gray-600 p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {/* Period Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Period</label>
                <select
                  value={reportPeriod}
                  onChange={(e) => {
                    setReportPeriod(e.target.value)
                    fetchReportData(e.target.value)
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="current-month">Current Month</option>
                  <option value="last-month">Last Month</option>
                  <option value="all-time">All Time</option>
                </select>
              </div>

              {reportLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : reportData ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-sky-50 p-4 rounded-lg border border-sky-100">
                      <h4 className="text-sm font-medium text-sky-700 mb-2">Total Deposits</h4>
                      <p className="text-2xl font-bold text-sky-800">৳{reportData.summary.totalDeposits.toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                      <h4 className="text-sm font-medium text-emerald-700 mb-2">Total Transactions</h4>
                      <p className="text-2xl font-bold text-emerald-800">{reportData.summary.totalTransactions}</p>
                    </div>
                    <div className="bg-violet-50 p-4 rounded-lg border border-violet-100">
                      <h4 className="text-sm font-medium text-violet-700 mb-2">Average Amount</h4>
                      <p className="text-2xl font-bold text-violet-800">৳{reportData.summary.averageDepositAmount.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                      <h4 className="text-sm font-medium text-amber-700 mb-2">Active Members</h4>
                      <p className="text-2xl font-bold text-amber-800">{reportData.userSummary.length}</p>
                    </div>
                  </div>

                  {/* User Summary Table */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary by Member</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deposits</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Deposit</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {reportData.userSummary.map((user) => (
                            <tr key={user._id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div>
                                  <p className="font-medium text-gray-900">{user.name}</p>
                                  <p className="text-sm text-gray-500">{user.email}</p>
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                <span className="text-lg font-semibold text-green-600">৳{user.totalAmount.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-gray-900">{user.depositCount}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                                {new Date(user.lastDepositDate).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved By</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {reportData.transactions.slice(0, 20).map((transaction) => (
                            <tr key={transaction.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {new Date(transaction.createdAt).toLocaleDateString()}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {new Date(transaction.createdAt).toLocaleTimeString()}
                                  </p>
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div>
                                  <p className="font-medium text-gray-900">{transaction.user.name}</p>
                                  <p className="text-sm text-gray-500">{transaction.user.email}</p>
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                <span className="text-lg font-semibold text-green-600">৳{transaction.amount.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                                {transaction.approvedBy ? transaction.approvedBy.name : 'Auto-approved'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {reportData.transactions.length > 20 && (
                      <p className="text-sm text-gray-500 text-center mt-4">
                        Showing first 20 transactions of {reportData.transactions.length} total
                      </p>
                    )}
                  </div>

                  {/* Monthly Trends */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Monthly Summary</h4>
                    {reportData.monthlyTrends.length > 0 ? (
                      <div className="space-y-3">
                        {reportData.monthlyTrends.map((trend) => (
                          <div key={trend.period} className="bg-white rounded-lg border shadow-sm">
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h5 className="text-lg font-semibold text-gray-900">{trend.monthName} {trend.year}</h5>
                                  <p className="text-sm text-gray-500">
                                    {trend.periodStart} to {trend.periodEnd}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-bold text-green-600">৳{trend.totalAmount.toLocaleString()}</p>
                                  <p className="text-sm text-gray-500">Total Deposited</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                                <div className="text-center">
                                  <p className="text-lg font-semibold text-blue-600">{trend.transactionCount}</p>
                                  <p className="text-xs text-gray-500">Transactions</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-lg font-semibold text-purple-600">৳{trend.averagePerTransaction.toLocaleString()}</p>
                                  <p className="text-xs text-gray-500">Average per Transaction</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="text-gray-400 mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 font-medium">No Monthly Data Available</p>
                        <p className="text-gray-400 text-sm mt-1">
                          Monthly summaries will appear here once there are approved deposits
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">No report data available for the selected period.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
