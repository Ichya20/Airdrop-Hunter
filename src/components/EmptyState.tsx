import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon: IconName
  title: string
  tone?: 'neutral' | 'error' | 'warning'
  children?: ReactNode
  actions?: ReactNode
}

export function EmptyState({ icon, title, tone = 'neutral', children, actions }: EmptyStateProps) {
  return (
    <div className={`empty empty--${tone}`}>
      <span className="empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="empty__title">{title}</h3>
      {children ? <div className="empty__body">{children}</div> : null}
      {actions ? <div className="empty__actions">{actions}</div> : null}
    </div>
  )
}
