import type { TabId } from '@/lib/south-america/domain/types';

const TABS: { id: TabId; emoji: string; label: string }[] = [
  { id: 'today', emoji: '🏠', label: '오늘' },
  { id: 'workout', emoji: '💪', label: '운동' },
  { id: 'expedition', emoji: '🏕', label: '원정대' },
];

export function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <nav className="tabbar" aria-label="주요 화면">
      {TABS.map((t) => (
        <button key={t.id} className={`tab ${tab === t.id ? 'tab--on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
          <span className="tab__emoji" aria-hidden>{t.emoji}</span>
          <span className="tab__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
