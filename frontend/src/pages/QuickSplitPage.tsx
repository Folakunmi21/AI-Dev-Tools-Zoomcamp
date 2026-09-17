import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, ErrorNotice } from '../components/ui'
import { useMutation } from '../hooks/useQuery'
import { useSession } from '../state/session-context'

/**
 * Step one of Quick Split: who is splitting. No account required — the mock
 * backend keeps a guest's quick split in this browser.
 */
export function QuickSplitPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const [names, setNames] = useState<string[]>(() => [user ? user.name.split(' ')[0] : '', '', ''])
  const [title, setTitle] = useState('')

  const createQuickSplit = useMutation((service, memberNames: string[]) =>
    service.groups.createQuickSplit({ name: title, memberNames }),
  )

  const setName = (index: number, value: string) =>
    setNames((current) => current.map((name, position) => (position === index ? value : name)))

  const filled = names.map((name) => name.trim()).filter(Boolean)

  return (
    <div className="narrow stack">
      <div>
        <h1>Quick Split</h1>
        <p className="muted">
          Add the people splitting, then add the expense. Nothing to sign up for.
        </p>
      </div>

      <Card>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await createQuickSplit.mutate(filled)
            if (result.ok) navigate(`/quick/${result.data.id}`)
          }}
        >
          <label className="field">
            <span className="field-label">Name (optional)</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Friday dinner"
            />
          </label>

          <fieldset className="block">
            <legend>People</legend>
            <ul className="rows">
              {names.map((name, index) => (
                <li key={index} className="row">
                  <input
                    value={name}
                    onChange={(event) => setName(index, event.target.value)}
                    placeholder={index === 0 ? 'You' : `Person ${index + 1}`}
                    aria-label={index === 0 ? 'Your name' : `Person ${index + 1}`}
                  />
                  {names.length > 2 && (
                    <button
                      type="button"
                      className="link danger"
                      onClick={() =>
                        setNames((current) => current.filter((_, position) => position !== index))
                      }
                      aria-label={`Remove person ${index + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="link" onClick={() => setNames((current) => [...current, ''])}>
              Add another person
            </button>
          </fieldset>

          <ErrorNotice error={createQuickSplit.error} />

          <div className="form-actions">
            <button
              type="submit"
              className="primary"
              disabled={createQuickSplit.pending || filled.length < 2}
            >
              {createQuickSplit.pending ? 'Starting…' : 'Continue'}
            </button>
          </div>
          {filled.length < 2 && <p className="muted small">Add at least two people to continue.</p>}
        </form>
      </Card>
    </div>
  )
}
