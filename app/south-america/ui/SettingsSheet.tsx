import { useState } from 'react';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { TIME_SETTING_META, resolveSharedTimes, type PersonTimeSettings } from '@/lib/south-america/config/timeSettings';
import { fmt } from '@/lib/south-america/domain/time';
import { CatMark } from './common/CatMark';
import { Sheet } from './common/Sheet';
import { NumberStepper, TimeStepper } from './common/Stepper';
import { useToast } from './common/Toast';
import { useDay } from '../store/dayStore';
import { ERROR_TEXT } from './today/format';

export type SettingsView = 'time';

const UNSET_START = 10;

/** 시간 설정: 개인별(이동·준비·샤워)과 공동(저녁 준비·식사·식후 대기). 바꾸면 계산이 바로 다시 돼요. */
export function SettingsSheet({ onClose, initialView = 'time' }: { onClose: () => void; initialView?: SettingsView }) {
  const day = useDay();
  void initialView;
  const toast = useToast();
  const [who, setWho] = useState<PersonId>(day.viewer);
  const s = day.state.settings;
  const shared = resolveSharedTimes(s);

  const put = (p: PersonId, key: keyof PersonTimeSettings, v: number | null) => {
    const r = day.setSetting(p, key, v);
    if (!r.ok) toast(ERROR_TEXT[r.reason]);
  };
  const personal = TIME_SETTING_META.filter((m) => m.group === 'personal' && m.key !== 'bedTarget');
  const sharedMeta = TIME_SETTING_META.filter((m) => m.group === 'shared');
  const unset = TIME_SETTING_META.filter((m) => m.group === 'unset');

  return (
    <Sheet open onClose={onClose} title="⚙️ 시간 설정">
      <p className="tiny">일정 계산에 쓰는 시간이에요. 바꾸면 오늘 일정이 바로 다시 계산돼요. 이미 완료한 시각은 바뀌지 않아요.</p>
      <div className="seg" role="group" aria-label="누구의 설정">
        {(['yangcho', 'tawi'] as const).map((p) => (
          <button key={p} className={`seg__btn ${who === p ? 'seg__btn--on' : ''}`} onClick={() => setWho(p)}>
            <CatMark who={p} size="sm" /> {PEOPLE[p].name}
          </button>
        ))}
      </div>

      <h3 className="set__h">개인 시간</h3>
      {personal.map((m) => (
        <div className="set__row" key={m.key}>
          <span className="set__label">{m.label}</span>
          <NumberStepper label={m.label} step={5} value={s[who][m.key] as number} onChange={(v) => put(who, m.key, v)} />
        </div>
      ))}
      <div className="set__row set__row--col">
        <span className="set__label">침대 목표 시각 (안내용)</span>
        <TimeStepper label="침대 목표 시각" value={s[who].bedTarget} initial={23 * 60} step={15} onChange={(v) => put(who, 'bedTarget', v)} onClear={() => put(who, 'bedTarget', null)} />
      </div>

      <h3 className="set__h">함께 하는 시간 <small>(둘 다 같이 바뀌어요 · 값이 다르면 큰 값 사용)</small></h3>
      {sharedMeta.map((m) => (
        <div className="set__row" key={m.key}>
          <span className="set__label">{m.label.replace(/ \(공동.*\)/, '')}</span>
          <NumberStepper
            label={m.label}
            step={5}
            value={shared[m.key as 'dinnerPrep' | 'dinnerEat' | 'postMealWait']}
            onChange={(v) => {
              put('yangcho', m.key, v);
              put('tawi', m.key, v);
            }}
          />
        </div>
      ))}

      <h3 className="set__h">아직 정해지지 않은 시간 <small>(비워 두면 직접 입력이 필요해요)</small></h3>
      {unset.map((m) => {
        const v = s[who][m.key] as number | null;
        return (
          <div className="set__row" key={m.key}>
            <span className="set__label">{m.label.replace(' (미설정)', '')}</span>
            {v === null ? (
              <button className="btn btn--small btn--ghost" onClick={() => put(who, m.key, UNSET_START)}>값 넣기</button>
            ) : (
              <span className="set__unset">
                <NumberStepper label={m.label} step={5} value={v} onChange={(x) => put(who, m.key, x)} />
                <button className="btn btn--text" onClick={() => put(who, m.key, null)} aria-label={`${m.label} 비우기`}>비우기</button>
              </span>
            )}
          </div>
        );
      })}
      <p className="tiny">기본 침대 목표: {s.yangcho.bedTarget === null ? '없음' : `양초 ${fmt(s.yangcho.bedTarget)}`}</p>

      <p className="tiny" data-testid="data-section">설정과 기록은 서버에 저장되고 양초·타위 두 폰이 같은 값을 봐요.</p>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={() => { day.resetSettings(); toast('기본값으로 되돌렸어요'); }}>기본값으로</button>
        <button className="btn btn--primary" onClick={onClose}>닫기</button>
      </div>
    </Sheet>
  );
}
