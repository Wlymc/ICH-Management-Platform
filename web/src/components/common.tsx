import type { ReactNode } from 'react';

export function LoadingState({ label = '正在读取非遗档案…' }: { label?: string }) {
  return (
    <div className="react-loading-card">
      <span aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ error }: { error: Error | null }) {
  return (
    <div className="react-error-card" role="alert">
      <strong>内容暂时无法加载</strong>
      <p>{error?.message || '请稍后重试。'}</p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">◌</div>
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-sub">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
