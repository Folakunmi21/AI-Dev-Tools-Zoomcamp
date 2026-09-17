import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { amountToInput, formatMoney, parseAmount, sum } from '../domain/money'
import { computeParticipantAmounts, validateSplit, type SplitInput } from '../domain/split'
import type { Expense, Group, GroupMember, Id, SplitMethod } from '../domain/types'
import { useMutation } from '../hooks/useQuery'
import type { ExpenseInput, UploadedFile } from '../services/types'
import { ErrorNotice, Field } from './ui'

const SPLIT_METHODS: Array<{ value: SplitMethod; label: string; hint: string }> = [
  { value: 'equal', label: 'Equally', hint: 'Divided evenly between everyone selected.' },
  { value: 'custom', label: 'Custom amounts', hint: 'Enter exact amounts. They must add up to the total.' },
  { value: 'percentage', label: 'Percentages', hint: 'Enter percentages. They must add up to 100%.' },
  { value: 'shares', label: 'Shares', hint: 'Enter shares, e.g. 2 / 1 / 1. Split proportionally.' },
]

interface Props {
  group: Group
  members: GroupMember[]
  /** Existing expense to edit, or null to create a new one. */
  expense?: Expense | null
  defaultPayerId?: Id | null
  onSaved: () => void
  onCancel: () => void
}

interface ParticipantRow {
  memberId: Id
  selected: boolean
  /** Raw text, interpreted according to the split method. */
  value: string
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export function ExpenseForm({ group, members, expense, defaultPayerId, onSaved, onCancel }: Props) {
  const editing = Boolean(expense)

  const [description, setDescription] = useState(expense?.description ?? '')
  const [amountText, setAmountText] = useState(expense ? amountToInput(expense.totalAmount) : '')
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? todayIso())
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(expense?.splitMethod ?? 'equal')

  const [multiplePayers, setMultiplePayers] = useState((expense?.payers.length ?? 1) > 1)
  const [singlePayerId, setSinglePayerId] = useState<Id>(
    expense?.payers[0]?.memberId ?? defaultPayerId ?? members[0]?.id ?? '',
  )
  const [payerAmounts, setPayerAmounts] = useState<Record<Id, string>>(() => {
    const initial: Record<Id, string> = {}
    for (const payer of expense?.payers ?? []) initial[payer.memberId] = amountToInput(payer.amount)
    return initial
  })

  const [participants, setParticipants] = useState<ParticipantRow[]>(() =>
    members.map((member) => {
      const existing = expense?.participants.find((candidate) => candidate.memberId === member.id)
      const selected = expense ? Boolean(existing) : true
      let value = ''
      if (existing && expense) {
        value =
          expense.splitMethod === 'custom'
            ? amountToInput(existing.calculatedAmount)
            : expense.splitMethod === 'equal'
              ? ''
              : String(existing.allocationValue)
      }
      return { memberId: member.id, selected, value }
    }),
  )

  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(expense?.receipt?.fileUrl ?? null)
  const [receiptName, setReceiptName] = useState<string | null>(expense?.receipt?.fileName ?? null)
  const [receiptRemoved, setReceiptRemoved] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const totalAmount = parseAmount(amountText) ?? 0
  const memberName = (memberId: Id) =>
    members.find((member) => member.id === memberId)?.displayName ?? 'Unknown'

  const selectedParticipants = participants.filter((row) => row.selected)

  /** Payer list in the shape the domain and the service both expect. */
  const payerInputs = useMemo(() => {
    if (!multiplePayers) {
      return singlePayerId ? [{ memberId: singlePayerId, amount: totalAmount }] : []
    }
    return Object.entries(payerAmounts)
      .map(([memberId, text]) => ({ memberId, amount: parseAmount(text) ?? 0 }))
      .filter((payer) => payer.amount !== 0)
  }, [multiplePayers, singlePayerId, payerAmounts, totalAmount])

  const splitInput: SplitInput = useMemo(
    () => ({
      totalAmount,
      splitMethod,
      payers: payerInputs,
      participants: selectedParticipants.map((row) => ({
        memberId: row.memberId,
        allocationValue:
          splitMethod === 'equal'
            ? 1
            : splitMethod === 'custom'
              ? (parseAmount(row.value) ?? 0)
              : Number(row.value || 0),
      })),
    }),
    [totalAmount, splitMethod, payerInputs, selectedParticipants],
  )

  const issues = useMemo(() => validateSplit(splitInput), [splitInput])
  const preview = useMemo(
    () => (issues.length === 0 ? computeParticipantAmounts(splitInput) : []),
    [issues, splitInput],
  )

  const allocationTotal = useMemo(() => {
    if (splitMethod === 'custom') {
      return sum(splitInput.participants.map((participant) => participant.allocationValue))
    }
    return splitInput.participants.reduce((acc, participant) => acc + participant.allocationValue, 0)
  }, [splitInput, splitMethod])

  const saveExpense = useMutation(async (service, input: ExpenseInput) => {
    let receipt: UploadedFile | null | undefined
    if (receiptFile) receipt = await service.uploads.uploadReceipt(receiptFile)
    else if (receiptRemoved) receipt = null
    else if (editing) receipt = undefined
    else receipt = null

    if (expense) {
      const { groupId: _groupId, ...rest } = input
      return service.expenses.update(expense.id, { ...rest, receipt })
    }
    return service.expenses.create({ ...input, receipt: receipt ?? null })
  })

  const formIssues = [...issues]
  if (!description.trim()) {
    formIssues.unshift({ field: 'description', message: 'Give the expense a description.' })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (formIssues.length > 0) return

    const result = await saveExpense.mutate({
      groupId: group.id,
      description,
      totalAmount,
      expenseDate,
      splitMethod,
      payers: payerInputs,
      participants: splitInput.participants,
    })
    if (result.ok) onSaved()
  }

  function handleReceiptChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setReceiptFile(file)
    setReceiptRemoved(false)
    setReceiptName(file?.name ?? null)
    setReceiptPreview(file ? URL.createObjectURL(file) : null)
  }

  function removeReceipt() {
    setReceiptFile(null)
    setReceiptPreview(null)
    setReceiptName(null)
    setReceiptRemoved(true)
  }

  const activeMethod = SPLIT_METHODS.find((method) => method.value === splitMethod)!

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <div className="grid-2">
        <Field label="Description">
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner at Nok"
            autoFocus
          />
        </Field>

        <Field label={`Total amount (${group.currency})`}>
          <input
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            placeholder="45,000"
            inputMode="decimal"
          />
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Date">
          <input
            type="date"
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
          />
        </Field>

        <Field label="Split">
          <select
            value={splitMethod}
            onChange={(event) => setSplitMethod(event.target.value as SplitMethod)}
          >
            {SPLIT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="block">
        <legend>
          Paid by
          <button
            type="button"
            className="link small"
            onClick={() => setMultiplePayers((current) => !current)}
          >
            {multiplePayers ? 'Use a single payer' : 'Split across multiple payers'}
          </button>
        </legend>

        {multiplePayers ? (
          <>
            <ul className="rows">
              {members.map((member) => (
                <li key={member.id} className="row">
                  <span>{member.displayName}</span>
                  <input
                    aria-label={`Amount paid by ${member.displayName}`}
                    value={payerAmounts[member.id] ?? ''}
                    onChange={(event) =>
                      setPayerAmounts((current) => ({ ...current, [member.id]: event.target.value }))
                    }
                    placeholder="0"
                    inputMode="decimal"
                  />
                </li>
              ))}
            </ul>
            <p className="muted small">
              Paid so far: {formatMoney(sum(payerInputs.map((payer) => payer.amount)), group.currency)} of{' '}
              {formatMoney(totalAmount, group.currency)}
            </p>
          </>
        ) : (
          <select
            aria-label="Payer"
            value={singlePayerId}
            onChange={(event) => setSinglePayerId(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <fieldset className="block">
        <legend>Split between</legend>
        <p className="muted small">{activeMethod.hint}</p>
        <ul className="rows">
          {participants.map((row) => {
            const allocated = preview.find((item) => item.memberId === row.memberId)
            return (
              <li key={row.memberId} className="row participant">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(event) =>
                      setParticipants((current) =>
                        current.map((item) =>
                          item.memberId === row.memberId
                            ? { ...item, selected: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  <span>{memberName(row.memberId)}</span>
                </label>

                {row.selected && splitMethod !== 'equal' && (
                  <input
                    aria-label={`${
                      splitMethod === 'custom' ? 'Amount' : splitMethod === 'percentage' ? 'Percentage' : 'Shares'
                    } for ${memberName(row.memberId)}`}
                    value={row.value}
                    onChange={(event) =>
                      setParticipants((current) =>
                        current.map((item) =>
                          item.memberId === row.memberId ? { ...item, value: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder={splitMethod === 'percentage' ? '%' : splitMethod === 'shares' ? 'shares' : '0'}
                    inputMode="decimal"
                  />
                )}

                <span className="row-amount">
                  {allocated ? formatMoney(allocated.calculatedAmount, group.currency) : '—'}
                </span>
              </li>
            )
          })}
        </ul>

        {splitMethod !== 'equal' && (
          <p className="muted small">
            {splitMethod === 'custom'
              ? `Allocated ${formatMoney(allocationTotal, group.currency)} of ${formatMoney(totalAmount, group.currency)}`
              : splitMethod === 'percentage'
                ? `Allocated ${allocationTotal}% of 100%`
                : `${allocationTotal} shares in total`}
          </p>
        )}
      </fieldset>

      <fieldset className="block">
        <legend>Receipt (optional)</legend>
        <input type="file" accept="image/*" onChange={handleReceiptChange} aria-label="Receipt image" />
        {receiptPreview && (
          <div className="receipt-preview">
            <img src={receiptPreview} alt={receiptName ? `Receipt: ${receiptName}` : 'Receipt'} />
            <button type="button" className="link" onClick={removeReceipt}>
              Remove receipt
            </button>
          </div>
        )}
      </fieldset>

      {submitted && formIssues.length > 0 && (
        <ul className="notice error" role="alert">
          {formIssues.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      <ErrorNotice error={saveExpense.error} />

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saveExpense.pending}>
          {saveExpense.pending ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </form>
  )
}
