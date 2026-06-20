'use client'

import { BarChart } from '@mui/icons-material'
import { useEffect, useState } from 'react'

interface BillingCycle {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
  finalTotalExpenses: number
  finalTotalMealsPrepared: number
  finalCostPerMeal: number
  finalizedAt?: string
}

interface MemberSettlement {
  _id: string
  userId: string
  userName: string
  totalDepositsForCycle: number
  totalMealsConsumedForCycle: number
  calculatedIndividualMealCost: number
  finalBalance: number
  status: string
}

interface BillingProps {
  messId: string
  isAdmin: boolean
}

export default function Billing({ messId, isAdmin }: BillingProps) {
  const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([])
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle | null>(null)
  const [memberSettlements, setMemberSettlements] = useState<MemberSettlement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState('')

  const fetchBillingCycles = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/billing-cycles', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setBillingCycles(data.cycles)
        if (data.cycles.length > 0) {
          setSelectedCycle(data.cycles[0])
        }
      }
    } catch (error) {
      // Handle error silently
    } finally {
      setIsLoading(false)
    }
  }

  const fetchMemberSettlements = async (cycleId: string) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/billing-cycles/${cycleId}/settlements`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setMemberSettlements(data.settlements)
      }
    } catch (error) {
      // Handle error silently
    }
  }

  useEffect(() => {
    fetchBillingCycles()
  }, [])

  useEffect(() => {
    if (selectedCycle) {
      fetchMemberSettlements(selectedCycle.id)
    }
  }, [selectedCycle])

  const handleFinalizeCycle = async () => {
    if (!selectedCycle || !isAdmin) return

    if (!confirm(`Are you sure you want to finalize the billing cycle "${selectedCycle.name}"? This action cannot be undone.`)) {
      return
    }

    setIsProcessing(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/billing-cycles/${selectedCycle.id}/finalize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        setMessage('Billing cycle finalized successfully')
        await fetchBillingCycles()
      } else {
        const error = await response.json()
        setMessage(error.message || 'Failed to finalize billing cycle')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUpdateSettlementStatus = async (settlementId: string, newStatus: string) => {
    setIsProcessing(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/member-settlements/${settlementId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        setMessage('Settlement status updated successfully')
        if (selectedCycle) {
          await fetchMemberSettlements(selectedCycle.id)
        }
      } else {
        const error = await response.json()
        setMessage(error.message || 'Failed to update settlement status')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSendDuesReminder = async (userId: string, userName: string) => {
    setIsProcessing(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/dues-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          userId,
          cycleId: selectedCycle?.id
        })
      })

      if (response.ok) {
        setMessage(`Dues reminder sent to ${userName}`)
      } else {
        const error = await response.json()
        setMessage(error.message || 'Failed to send dues reminder')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800'
      case 'refunded':
        return 'bg-blue-100 text-blue-800'
      case 'pending_refund':
        return 'bg-yellow-100 text-yellow-800'
      case 'unpaid':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-300 rounded mb-4"></div>
          <div className="h-20 bg-gray-200 rounded mb-6"></div>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-gray-900">End-of-Cycle Financial Calculation</h3>
        {isAdmin && selectedCycle && selectedCycle.status === 'active' && (
          <button
            onClick={handleFinalizeCycle}
            disabled={isProcessing}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors"
          >
            Finalize Cycle
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800">{message}</p>
          <button
            onClick={() => setMessage('')}
            className="text-blue-600 hover:text-blue-800 text-sm mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Billing Cycle Selector */}
      {billingCycles.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">
            <BarChart style={{ fontSize: '6rem' }} />
          </div>
          <h4 className="text-lg font-medium text-gray-600 mb-2">No billing cycles yet</h4>
          <p className="text-gray-500">Billing cycles will be created automatically</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Billing Cycle
            </label>
            <select
              value={selectedCycle?.id || ''}
              onChange={(e) => {
                const cycle = billingCycles.find(c => c.id === e.target.value)
                setSelectedCycle(cycle || null)
              }}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 bg-white"
            >
              {billingCycles.map(cycle => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name} ({cycle.status === 'finalized' ? 'Finalized' : 'Active'})
                </option>
              ))}
            </select>
          </div>

          {selectedCycle && (
            <>
              {/* Overall Financial Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4">
                  <div className="text-center">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Total Expenses</h4>
                    <div className="text-2xl font-bold text-red-600">
                      ৳{selectedCycle.finalTotalExpenses.toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{selectedCycle.name}</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="text-center">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Total Meals Prepared</h4>
                    <div className="text-2xl font-bold text-blue-600">
                      {selectedCycle.finalTotalMealsPrepared}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">For entire cycle</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
                  <div className="text-center">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Final Cost Per Meal</h4>
                    <div className="text-2xl font-bold text-green-600">
                      ৳{selectedCycle.finalCostPerMeal.toFixed(2)}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedCycle.status === 'finalized' ? 'Finalized' : 'Calculated'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cycle Status */}
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{selectedCycle.name}</h4>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedCycle.startDate).toLocaleDateString()} - {new Date(selectedCycle.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                      selectedCycle.status === 'finalized' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedCycle.status === 'finalized' ? 'Finalized' : 'Active'}
                    </span>
                    {selectedCycle.finalizedAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        Finalized: {new Date(selectedCycle.finalizedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Member Settlements */}
              <div>
                <h4 className="text-lg font-medium text-gray-800 mb-4">Individual Member Statements</h4>
                {memberSettlements.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No settlement data available for this cycle</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Member
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Deposits
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Meals Consumed
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Meal Cost
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Final Balance
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          {isAdmin && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {memberSettlements.map((settlement) => (
                          <tr key={settlement.userId} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{settlement.userName}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-green-600">৳{settlement.totalDepositsForCycle}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-blue-600">{settlement.totalMealsConsumedForCycle}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-purple-600">৳{settlement.calculatedIndividualMealCost.toFixed(2)}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`text-sm font-bold ${
                                settlement.finalBalance >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {settlement.finalBalance >= 0 
                                  ? `Refund: ৳${settlement.finalBalance.toFixed(2)}`
                                  : `Due: ৳${Math.abs(settlement.finalBalance).toFixed(2)}`
                                }
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(settlement.status)}`}>
                                {settlement.status.replace('_', ' ').charAt(0).toUpperCase() + settlement.status.replace('_', ' ').slice(1)}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-y-1">
                                {settlement.status === 'unpaid' && settlement.finalBalance < 0 && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateSettlementStatus(settlement._id, 'paid')}
                                      disabled={isProcessing}
                                      className="block text-green-600 hover:text-green-900 disabled:text-gray-400"
                                    >
                                      Mark Paid
                                    </button>
                                    <button
                                      onClick={() => handleSendDuesReminder(settlement.userId, settlement.userName)}
                                      disabled={isProcessing}
                                      className="block text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                                    >
                                      Send Reminder
                                    </button>
                                  </>
                                )}
                                {settlement.finalBalance >= 0 && settlement.status !== 'refunded' && (
                                  <button
                                    onClick={() => handleUpdateSettlementStatus(settlement._id, 'refunded')}
                                    disabled={isProcessing}
                                    className="block text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                                  >
                                    Mark Refunded
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
