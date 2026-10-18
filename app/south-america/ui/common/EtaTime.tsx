import type { EtaSource } from '@/lib/south-america/domain/types';

// ETA 출처 표시 [P-030, 03 문서 2-3]. 색만으로 구분하지 않고 아이콘과 글자를 함께 써요.
// 기본값(📌)은 "아직 확인되지 않은 예상"이에요. 확인된 시각처럼 보이지 않게 흐리게 보여 줘요.
const META: Record<EtaSource, { icon: string; label: string; approx: boolean; dim: boolean }> = {
  self: { icon: '✅', label: '직접 입력', approx: false, dim: false },
  computed: { icon: '🧮', label: '계산 추정', approx: true, dim: true },
  default: { icon: '📌', label: '기본값 · 확인 전', approx: false, dim: true },
  partner: { icon: '🙋', label: '추정 · 확인 전', approx: true, dim: true },
  phone: { icon: '📞', label: '통화 확인', approx: false, dim: false },
};

/** 입력한 시각 + 기준 장소 + 출처. 예: "신도림역 18:20" / "📌 기본값 · 확인 전" */
export function EtaTime({ name, place, time, source, who, late = false }: { name: string; place: string; time: string; source: EtaSource; who?: string; late?: boolean }) {
  const m = META[source];
  const shown = m.approx && !time.startsWith('~') ? `~${time}` : time;
  const label = source === 'partner' && who ? `${who} 추정 · 확인 전` : m.label;
  return (
    <>
      <span className={`eta ${m.dim ? 'eta--dim' : ''}`}>
        <span className="eta__name">{name}</span>
        <span className="eta__sep" aria-hidden>·</span>
        <span className="eta__place">{place}</span>
        <span className="eta__time">{shown}</span>
      </span>
      <span className={`eta__src ${m.dim ? 'eta__src--unconfirmed' : 'eta__src--confirmed'}`}>
        {m.icon} {label}
        {late && <> · 예상 시각 지남 · 실제 미확인</>}
      </span>
    </>
  );
}
