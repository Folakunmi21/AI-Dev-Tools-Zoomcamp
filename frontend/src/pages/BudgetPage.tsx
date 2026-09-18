import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading } from '../components/ui'
import { formatMoney, parseAmount } from '../domain/money'
import { useMutation, useQuery } from '../hooks/useQuery'

export function BudgetPage() {
  const { budgetId = '' } = useParams()
  const { data, loading, error, reload } = useQuery((service) => service.budgets.get(budgetId), [budgetId])
  const [expenseName, setExpenseName] = useState('')
  const [amount, setAmount] = useState('')
  const addItem = useMutation((service) => service.budgets.addItem(budgetId, { name: expenseName, amount: parseAmount(amount) ?? 0 }))
  const updateItem = useMutation((service, itemId: string, isPaid: boolean) => service.budgets.updateItem(budgetId, itemId, { isPaid }))
  const removeItem = useMutation((service, itemId: string) => service.budgets.removeItem(budgetId, itemId))

  if (loading) return <Loading label="Loading budget…" />
  if (error) return <div className="stack"><ErrorNotice error={error} onRetry={reload} /><Link to="/budgets" className="link">Back to budgets</Link></div>
  if (!data) return null

  return (
    <div className="stack">
      <Link to="/budgets" className="link">← Personal budgets</Link>
      <header className="group-header">
        <div><p className="muted small">Personal budget</p><h1>{data.name}</h1></div>
      </header>

      <Card>
        <div className="totals">
          <div><span className="muted small">Total budgeted</span><strong>{formatMoney(data.totalAmount, data.currency)}</strong></div>
          <div><span className="muted small">Paid</span><strong className="good">{formatMoney(data.paidAmount, data.currency)}</strong></div>
          <div><span className="muted small">Balance remaining</span><strong className={data.remainingAmount > 0 ? 'bad' : 'good'}>{formatMoney(data.remainingAmount, data.currency)}</strong></div>
        </div>
      </Card>

      <Card title="Add an expense">
        <form className="inline-form" onSubmit={async (event) => {
          event.preventDefault()
          const result = await addItem.mutate()
          if (result.ok) { setExpenseName(''); setAmount('') }
        }}>
          <input value={expenseName} onChange={(event) => setExpenseName(event.target.value)} placeholder="Expense name" aria-label="Expense name" />
          <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" inputMode="decimal" aria-label="Expense amount" />
          <button type="submit" className="primary" disabled={addItem.pending || !expenseName.trim() || (parseAmount(amount) ?? 0) <= 0}>Add expense</button>
        </form>
        <ErrorNotice error={addItem.error} />
      </Card>

      <Card title="Expenses">
        {data.items.length === 0 ? <EmptyState title="No expenses added" body="Add your first expense above." /> : (
          <div className="budget-table" role="table" aria-label="Budget expenses">
            <div className="budget-item budget-head" role="row">
              <span role="columnheader">Expense</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader" className="budget-done-heading">Done</span>
              <span role="columnheader" />
            </div>
            <ul className="budget-items">
              {data.items.map((item) => (
                <li key={item.id} className={`budget-item ${item.isPaid ? 'paid' : ''}`} role="row">
                  <span className="budget-expense-name" role="cell">{item.name}</span>
                  <strong role="cell">{formatMoney(item.amount, data.currency)}</strong>
                  <span role="cell" className="budget-done-cell">
                    <button
                      type="button"
                      className={`done-toggle ${item.isPaid ? 'checked' : ''}`}
                      aria-pressed={item.isPaid}
                      aria-label={`Mark ${item.name} as ${item.isPaid ? 'not done' : 'done'}`}
                      onClick={() => updateItem.mutate(item.id, !item.isPaid)}
                    >
                      {item.isPaid ? '✓' : ''}
                    </button>
                  </span>
                  <button type="button" className="link danger" onClick={() => removeItem.mutate(item.id)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ErrorNotice error={updateItem.error ?? removeItem.error} />
      </Card>
    </div>
  )
}
