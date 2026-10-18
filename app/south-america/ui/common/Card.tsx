import type { ReactNode } from 'react';

export function Card({ title, emoji, tone, className = '', children, 'data-testid': testId }: { title?: string; emoji?: string; tone?: 'plain' | 'glacier' | 'terra' | 'night'; className?: string; children: ReactNode; 'data-testid'?: string }) {
  return (
    <section className={`card card--${tone ?? 'plain'} ${className}`} data-testid={testId}>
      {title && (
        <h2 className="card__title">
          {emoji && <span className="card__emoji" aria-hidden>{emoji}</span>}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** "예시 화면이에요" 작은 표시. 실제 앱에는 없는 미리보기 전용 표시예요. */
export function PreviewTag({ text }: { text: string }) {
  return <p className="previewtag">🧪 {text}</p>;
}
