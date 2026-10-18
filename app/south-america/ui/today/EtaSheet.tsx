import { useState } from 'react';
import type { Minute } from '@/lib/south-america/domain/time';
import type { EtaMode } from '@/lib/south-america/domain/day/day';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import type { EtaReference } from '@/lib/south-america/domain/timeline/types';
import { Sheet } from '../common/Sheet';
import { TimeStepper } from '../common/Stepper';
import { useDay } from '../../store/dayStore';
import { roundUp5 } from './format';

const MODE_FIELDS: Record<EtaMode, { ref: EtaReference; label: string }[]> = {
  subway: [{ ref: 'station_arrival', label: '신도림역 도착 예상' }],
  car: [
    { ref: 'company_departure', label: '회사 출발 예상' },
    { ref: 'home_arrival', label: '집 도착 예상 (직접 입력)' },
  ],
  home: [{ ref: 'ready_at_home', label: '준비를 시작할 수 있는 시각' }],
};
const MODE_LABEL: Record<EtaMode, string> = { subway: '🚇 지하철', car: '🚗 자동차', home: '🏠 이미 집' };

/** 각 장소의 입력은 따로 저장돼요. 헬스장 준비 완료 시각은 집 도착으로 쓰이지 않아요. */
export function EtaSheet({ person, onClose }: { person: PersonId; onClose: () => void }) {
  const { state, now, viewer, editEta } = useDay();
  const find = (ref: EtaReference): Minute | null => state.eta[person].find((e) => e.reference === ref)?.time ?? null;
  const initialMode: EtaMode = find('ready_at_home') !== null ? 'home' : find('company_departure') !== null || find('home_arrival') !== null ? 'car' : 'subway';

  const [mode, setMode] = useState<EtaMode>(initialMode);
  const [draft, setDraft] = useState<Partial<Record<EtaReference, Minute | null>>>({});
  const value = (ref: EtaReference): Minute | null => (ref in draft ? (draft[ref] ?? null) : find(ref));
  const start = roundUp5(now);

  const set = (ref: EtaReference, v: Minute | null) => setDraft((d) => ({ ...d, [ref]: v }));
  const save = () => {
    // 바뀐 값만 저장해요 (안 바꾼 📌 기본값이 "본인 입력"으로 둔갑하지 않게)
    const changed: Partial<Record<EtaReference, Minute | null>> = {};
    for (const [k, v] of Object.entries(draft) as [EtaReference, Minute | null][]) {
      if (v !== find(k)) changed[k] = v;
    }
    editEta(person, mode, changed);
    onClose();
  };
  const who = PEOPLE[person];
  const byPartner = viewer !== person;

  return (
    <Sheet open onClose={onClose} title={`${who.name} ETA`}>
      {byPartner && <p className="tiny">🙋 {PEOPLE[viewer].name}가 대신 넣는 값은 &lsquo;상대 추정&rsquo;으로 표시돼요. 본인이 [맞아]를 눌러야 확정돼요.</p>}
      <div className="seg" role="group" aria-label="이동 수단">
        {(['subway', 'car', 'home'] as const).map((m) => (
          <button key={m} className={`seg__btn ${mode === m ? 'seg__btn--on' : ''}`} onClick={() => setMode(m)} data-testid={`eta-mode-${m}`}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {MODE_FIELDS[mode].map((f) => (
        <div className="field" key={f.ref}>
          <label className="field__label">{f.label}</label>
          <TimeStepper label={f.label} value={value(f.ref)} initial={start} chips={[-10, 10, 20]} onChange={(m) => set(f.ref, m)} onClear={() => set(f.ref, null)} />
        </div>
      ))}
      <div className="field">
        <label className="field__label">헬스장에서 운동 가능한 시각 (선택, 직접 정하고 싶을 때만)</label>
        <TimeStepper label="헬스장 운동 가능 시각" value={value('gym_ready')} initial={start} chips={[-10, 10, 20]} onChange={(m) => set('gym_ready', m)} onClear={() => set('gym_ready', null)} />
        <p className="tiny">
          PLAN B에서 집을 거치지 않고 바로 헬스장에 갈 때 쓰는 시각이에요. 비워 두면{' '}
          {mode === 'subway' && state.settings[person].stationToGymDirect !== null ? `신도림역 도착 + ${state.settings[person].stationToGymDirect}분` : '직접 입력이 필요해요'}
          으로 계산해요. 집 도착 시각으로는 쓰이지 않아요.
        </p>
      </div>
      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose}>취소</button>
        <button className="btn btn--primary" onClick={save} data-testid="eta-save">저장</button>
      </div>
    </Sheet>
  );
}
