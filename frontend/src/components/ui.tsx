import type { ReactNode } from 'react'
import { isServiceError } from '../services/types'

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted loading" role="status">
      {label}
    </p>
  )
}

/** Renders any thrown error, using the service layer's message when it has one. */
export function ErrorNotice({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  if (!error) return null
  const detail = isServiceError(error) ? error.message : error.message || 'Something went wrong.'
  return (
    <div className="notice error" role="alert">
      <span>{detail}</span>
      {onRetry && (
        <button type="button" className="link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function formatDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
