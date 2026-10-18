import { useState } from 'react';
import Link from 'next/link';
import { daysBetween, weekdayKo } from '@/lib/south-america/domain/time';
import { useClock } from '../store/clock';
import { SettingsSheet } from './SettingsSheet';

const DEPARTURE = '2026-12-17';

export function Header() {
  const { today } = useClock();
  const [settings, setSettings] = useState(false);
  const [, m, d] = today.split('-');
  const date = `${Number(m)}/${Number(d)} ${weekdayKo(today)}`;
  const left = daysBetween(today, DEPARTURE);
  const dday = left > 0 ? `D-${left}` : left === 0 ? 'D-DAY' : `D+${-left}`;
  return (
    <>
      <header className="hdr">
        <div className="hdr__title" title={`${date} · ${dday}`}>
          <span>{date}</span>
          <i>·</i>
          <b>{dday}</b>
        </div>
        <div className="hdr__actions">
          <Link className="iconbtn" href="/" aria-label="야옹이월드 홈으로" data-testid="back-home">
            🏠
          </Link>
          <button className="iconbtn" aria-label="시간 설정" onClick={() => setSettings(true)} data-testid="open-settings">
            ⚙️
          </button>
        </div>
      </header>
      <div className="textile" aria-hidden />
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}
