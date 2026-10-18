import { fmt, type Minute } from '@/lib/south-america/domain/time';

/** 시각 스테퍼: [－] 19:35 [＋]. 값이 없으면 [입력]만 보여요. 숫자 키패드는 쓰지 않아요 [P-056]. */
export function TimeStepper({
  value,
  onChange,
  onClear,
  initial,
  step = 5,
  chips = [],
  label,
}: {
  value: Minute | null;
  onChange: (m: Minute) => void;
  onClear?: () => void;
  /** 값이 없을 때 [입력]을 누르면 시작하는 시각 */
  initial: Minute;
  step?: number;
  /** 빠르게 더하거나 빼는 분 (예: [-10, 10, 20]) */
  chips?: number[];
  label: string;
}) {
  if (value === null) {
    return (
      <div className="tstep tstep--empty">
        <span className="tstep__val tstep__val--none">--:--</span>
        <button className="btn btn--small btn--ghost" onClick={() => onChange(initial)} aria-label={`${label} 입력하기`}>
          입력
        </button>
      </div>
    );
  }
  return (
    <div className="tstep" role="group" aria-label={label}>
      <button className="stepper__btn" onClick={() => onChange(value - step)} aria-label={`${step}분 빠르게`}>－</button>
      <span className="tstep__val">{fmt(value)}</span>
      <button className="stepper__btn" onClick={() => onChange(value + step)} aria-label={`${step}분 늦게`}>＋</button>
      {chips.length > 0 && (
        <div className="tstep__chips">
          {chips.map((c) => (
            <button key={c} className="chip chip--btn" onClick={() => onChange(value + c)}>
              {c > 0 ? `+${c}` : c}분
            </button>
          ))}
        </div>
      )}
      {onClear && (
        <button className="btn btn--text tstep__clear" onClick={onClear} aria-label={`${label} 지우기`}>
          지우기
        </button>
      )}
    </div>
  );
}

/** 분 단위 숫자 스테퍼 (설정용): [－] 15분 [＋] */
export function NumberStepper({ value, onChange, step, label, min = 0 }: { value: number; onChange: (v: number) => void; step: number; label: string; min?: number }) {
  return (
    <div className="nstep" role="group" aria-label={label}>
      <button className="stepper__btn stepper__btn--sm" onClick={() => onChange(Math.max(min, value - step))} aria-label={`${label} ${step}분 줄이기`}>－</button>
      <span className="nstep__val">{value}분</span>
      <button className="stepper__btn stepper__btn--sm" onClick={() => onChange(value + step)} aria-label={`${label} ${step}분 늘리기`}>＋</button>
    </div>
  );
}
