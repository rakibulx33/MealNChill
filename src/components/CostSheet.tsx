'use client'

import { Assignment, Warning } from '@mui/icons-material'
import { useEffect, useState } from 'react'

interface ExpenseItem {
  id: string
  itemName: string
  amount: number
  date: string
  enteredByUserName: string
}

interface CostSheetProps {
  messId: string
  isAdmin: boolean
}

export default function CostSheet({ messId, isAdmin }: CostSheetProps) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [totalMeals, setTotalMeals] = useState(0)
  const [currentCostPerMeal, setCurrentCostPerMeal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    itemName: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState('')

  const fetchCostSheetData = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/cost-sheet', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setExpenses(data.expenses)
        setTotalExpenses(data.totalExpenses)
        setTotalMeals(data.totalMeals)
        setCurrentCostPerMeal(data.currentCostPerMeal)
      }
    } catch (error) {
      // Handle error silently
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCostSheetData()
  }, [])

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.itemName.trim() || !expenseForm.amount || parseFloat(expenseForm.amount) <= 0) return

    setIsProcessing(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/cost-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemName: expenseForm.itemName.trim(),
          amount: parseFloat(expenseForm.amount),
          date: expenseForm.date
        })
      })

      if (response.ok) {
        setMessage('Expense added successfully')
        setExpenseForm({ 
          itemName: '', 
          amount: '', 
          date: new Date().toISOString().split('T')[0] 
        })
        setShowAddExpense(false)
        await fetchCostSheetData()
      } else {
        const error = await response.json()
        setMessage(error.message || 'Failed to add expense')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setIsProcessing(false)
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
        <h3 className="text-xl font-semibold text-gray-900">Cost Sheet</h3>
        {isAdmin && (
          <button
            onClick={() => setShowAddExpense(true)}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Add Expense
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

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200 rounded-lg p-4">
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-700 mb-1">Total Expenses</h4>
            <div className="text-2xl font-bold text-red-600">৳{totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-gray-600 mt-1">Current cycle</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-700 mb-1">Total Meals</h4>
            <div className="text-2xl font-bold text-blue-600">{totalMeals}</div>
            <p className="text-xs text-gray-600 mt-1">Prepared so far</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-700 mb-1">Current Cost/Meal</h4>
            <div className="text-2xl font-bold text-green-600">
              ৳{currentCostPerMeal.toFixed(2)}
            </div>
            <p className="text-xs text-gray-600 mt-1">Dynamic rate</p>
          </div>
        </div>
      </div>

      {/* Important Notice for Admin */}
      {isAdmin && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center">
            <Warning className="mr-1" style={{ fontSize: '1rem' }} />
            Important Financial Rules
          </h4>
          <ul className="text-xs text-amber-700 space-y-1">
            <li>• Once saved, expenses cannot be edited or deleted</li>
            <li>• Expense amounts are immediately deducted from mess balance</li>
            <li>• For corrections, add a new offsetting entry (e.g., "Correction for Rice: -50")</li>
            <li>• Cost per meal updates automatically as expenses and meals are added</li>
          </ul>
        </div>
      )}

      {/* Expense History */}
      <div>
        <h4 className="text-lg font-medium text-gray-800 mb-4">Expense History</h4>
        {expenses.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">
              <Assignment style={{ fontSize: '6rem' }} />
            </div>
            <h5 className="text-lg font-medium text-gray-600 mb-2">No expenses recorded yet</h5>
            <p className="text-gray-500 mb-4">
              {isAdmin ? 'Add your first expense to start tracking costs' : 'No expenses have been added yet'}
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowAddExpense(true)}
                className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
              >
                Add First Expense
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-900 mb-1">{expense.itemName}</h5>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span>Date: {new Date(expense.date).toLocaleDateString()}</span>
                      <span>Added by: {expense.enteredByUserName}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-600">৳{expense.amount.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost Calculation Info */}
      {expenses.length > 0 && (
        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h5 className="text-sm font-semibold text-gray-800 mb-2">Cost Calculation</h5>
          <div className="text-xs text-gray-600 space-y-1">
            <div>Current Cost per Meal = Total Expenses (৳{totalExpenses.toLocaleString()}) ÷ Total Meals ({totalMeals})</div>
            <div>This rate updates dynamically as new expenses and meals are added</div>
            <div>Final rate will be calculated at the end of the billing cycle for dues calculation</div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h4 className="text-lg font-semibold mb-4">Add New Expense</h4>
            
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item/Expense Name *
                </label>
                <input
                  type="text"
                  value={expenseForm.itemName}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, itemName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                  placeholder="e.g., Monthly Groceries, Cook's Salary, Electricity Bill"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (৳) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                  placeholder="Enter amount"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                  required
                />
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h5 className="text-sm font-medium text-red-800 mb-1 flex items-center">
                  <Warning className="mr-1" style={{ fontSize: '0.875rem' }} />
                  Important
                </h5>
                <p className="text-xs text-red-700">
                  This expense cannot be modified once saved. The amount will be immediately 
                  deducted from the mess balance. Please double-check all details.
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddExpense(false)
                    setExpenseForm({ 
                      itemName: '', 
                      amount: '', 
                      date: new Date().toISOString().split('T')[0] 
                    })
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                >
                  {isProcessing ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
