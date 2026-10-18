import { useEffect, type ReactNode } from 'react';

/** 아래에서 올라오는 패널. 새 페이지 대신 쓰는 시트예요 [P, 03 문서 1장]. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grab" aria-hidden />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
