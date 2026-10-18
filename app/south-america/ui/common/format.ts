/** 분(0~1439)을 "19:35" 모양으로. 화면 표시용이에요. */
export const fmtHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
