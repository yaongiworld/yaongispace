import { createTimeSettings, type TimeSettings, type TimeSettingsOverrides } from '@/lib/south-america/config/timeSettings';
import { clockToPlanMinutes as C, fmt } from '@/lib/south-america/domain/time';
import type { EtaInput, EtaReference, InputSource, Timeline, TimelineInput, TimelineNode } from '@/lib/south-america/domain/timeline/types';

export { C, fmt };

export const eta = (reference: EtaReference, hhmm: string, source: InputSource = 'self'): EtaInput => ({
  reference,
  time: C(hhmm),
  source,
});

export const station = (hhmm: string, source: InputSource = 'self') => eta('station_arrival', hhmm, source);

export function makeInput(over: Partial<TimelineInput> & { overrides?: TimeSettingsOverrides; settings?: TimeSettings } = {}): TimelineInput {
  const { overrides, ...rest } = over;
  return {
    plan: 'A',
    mealOrder: 'after',
    workoutMinutes: 75,
    eta: { yangcho: [station('18:20')], tawi: [station('18:50')] },
    settings: createTimeSettings(overrides),
    ...rest,
  };
}

export const node = (tl: Timeline, lane: string, id: string): TimelineNode => {
  const n = tl.nodes.find((x) => x.lane === lane && x.id === id);
  if (!n) throw new Error(`노드가 없어요: ${lane}.${id}`);
  return n;
};

/** 노드 시각을 "19:40" 모양으로 (자정을 넘기면 "00:45+1") */
export const at = (tl: Timeline, lane: string, id: string): string => {
  const n = node(tl, lane, id);
  return n.time === null ? 'null' : fmt(n.time);
};
