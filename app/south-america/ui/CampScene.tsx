import type { CampMode } from '@/lib/south-america/domain/types';

type Props = {
  mode: CampMode;
  stage: number; // 캠프 단계(영구 성장). 텐트 수로 표현
  decorations?: string[]; // 영구 장식 🚩⭐
  gifts?: number; // 🎁 해금한 경험 수만큼
  backpack?: boolean; // 오늘만: 짐 챙기기 완료
  footprints?: boolean; // 오늘만: 함께 걷기
};

const STARS = [
  [24, 22], [58, 40], [92, 18], [128, 34], [170, 14], [208, 30], [246, 20], [300, 44], [40, 62], [150, 56],
];

/**
 * 베이스캠프 장면. 큰 애니메이션 없이 그림 상태만 바꿔요 [D-114].
 * - calm    : 평소 (낮)
 * - ready   : 출발 준비 자세 (오늘만)
 * - bonfire : 모닥불 + 두 캐릭터 나란히 앉기 (오늘만, 둘 다 완료) [D-113]
 */
/** 고양이 임시 표기: 색 원(양초 파랑 / 타위 코랄) 위에 🐱 */
function Cat({ x, y, size, who, className }: { x: number; y: number; size: number; who: 'yangcho' | 'tawi'; className?: string }) {
  const c = who === 'yangcho' ? '#3f8fbd' : '#d4604a';
  return (
    <g className={className}>
      <circle cx={x} cy={y - size * 0.34} r={size * 0.62} fill={c} fillOpacity="0.28" stroke={c} strokeWidth="2" />
      <text x={x} y={y} fontSize={size} textAnchor="middle">🐱</text>
    </g>
  );
}

export function CampScene({ mode, stage, decorations = [], gifts = 0, backpack = false, footprints = false }: Props) {
  const night = mode === 'bonfire';
  const tents = Math.min(Math.max(stage, 1), 3);
  const label =
    mode === 'bonfire'
      ? '모닥불이 켜지고 두 캐릭터가 나란히 앉아 있어요'
      : mode === 'ready'
        ? '두 캐릭터가 출발 준비를 하고 있어요'
        : '평소 베이스캠프';

  return (
    <figure className={`camp camp--${mode}`}>
      <svg viewBox="0 0 320 200" role="img" aria-label={label}>
        <defs>
          <linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8FCBEA" />
            <stop offset="1" stopColor="#FFF1D6" />
          </linearGradient>
          <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B2552" />
            <stop offset="0.6" stopColor="#59478F" />
            <stop offset="1" stopColor="#F0A15B" />
          </linearGradient>
          <radialGradient id="fire-glow">
            <stop offset="0" stopColor="#FFD27A" stopOpacity="0.95" />
            <stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="320" height="200" fill={night ? 'url(#sky-night)' : 'url(#sky-day)'} />

        {night ? (
          <g>
            {STARS.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} className="star" style={{ animationDelay: `${(i % 5) * 0.4}s` }} />
            ))}
            <circle cx="278" cy="36" r="13" fill="#FFF2C4" />
            <circle cx="283" cy="32" r="11" fill="#3A3F78" opacity="0.55" />
          </g>
        ) : (
          <g>
            <circle cx="272" cy="38" r="15" fill="#FFD166" />
            <circle cx="272" cy="38" r="22" fill="#FFD166" opacity="0.25" />
            <ellipse cx="70" cy="40" rx="26" ry="8" fill="#fff" opacity="0.75" />
            <ellipse cx="88" cy="35" rx="16" ry="7" fill="#fff" opacity="0.75" />
            <ellipse cx="200" cy="58" rx="22" ry="6" fill="#fff" opacity="0.6" />
          </g>
        )}

        {/* 안데스 산봉우리 */}
        <polygon className="m-back" points="0,140 40,90 70,115 110,70 150,120 190,85 235,125 275,80 320,125 320,170 0,170" />
        <g className="m-snow">
          <polygon points="40,90 32,102 38,99 42,104 48,100" />
          <polygon points="110,70 99,87 106,83 111,89 118,84" />
          <polygon points="190,85 181,98 187,95 192,100 198,96" />
          <polygon points="275,80 266,94 272,91 277,96 284,92" />
        </g>
        <polygon className="m-front" points="0,168 60,136 120,158 190,140 250,160 320,138 320,176 0,176" />
        <path className="ground" d="M0 200 L0 162 Q80 150 160 160 T320 154 L320 200 Z" />

        {/* 영구 성장: 텐트(캠프 단계), 장식, 선물 상자 */}
        <text x="46" y="170" fontSize="40" textAnchor="middle">⛺</text>
        {tents >= 2 && <text x="82" y="172" fontSize="30" textAnchor="middle">⛺</text>}
        {tents >= 3 && <text x="14" y="172" fontSize="26" textAnchor="middle">⛺</text>}
        {decorations.slice(0, 4).map((d, i) => (
          <text key={i} x={252 + i * 20} y={152 - (i % 2) * 6} fontSize="18" textAnchor="middle">{d}</text>
        ))}
        {Array.from({ length: Math.min(gifts, 4) }).map((_, i) => (
          <text key={i} x={236 + i * 18} y="188" fontSize="16" textAnchor="middle">🎁</text>
        ))}

        {/* 오늘만: 연출 */}
        {backpack && <text x="104" y="184" fontSize="20" textAnchor="middle">🎒</text>}
        {footprints && <text x="130" y="192" fontSize="14" textAnchor="middle">👣</text>}

        {mode === 'calm' && (
          <g>
            <Cat x={150} y={176} size={30} who="yangcho" className="hop hop--slow" />
            <Cat x={188} y={176} size={32} who="tawi" className="hop hop--slow2" />
          </g>
        )}

        {mode === 'ready' && (
          <g>
            <Cat x={138} y={176} size={32} who="yangcho" className="hop" />
            <Cat x={178} y={176} size={34} who="tawi" className="hop hop--b" />
            <text x="206" y="156" fontSize="20" textAnchor="middle">🎒</text>
            <text x="160" y="132" fontSize="13" textAnchor="middle" className="bubble-text">출발 준비!</text>
          </g>
        )}

        {mode === 'bonfire' && (
          <g>
            <circle cx="222" cy="168" r="58" fill="url(#fire-glow)" className="glow" />
            {/* 통나무 의자 */}
            <rect x="102" y="176" width="84" height="12" rx="6" className="log" />
            <circle cx="104" cy="182" r="6" className="log-end" />
            <circle cx="184" cy="182" r="6" className="log-end" />
            {/* 나란히 앉은 두 캐릭터 */}
            <Cat x={128} y={180} size={32} who="yangcho" className="sit" />
            <Cat x={162} y={180} size={34} who="tawi" className="sit sit--b" />
            <text x="145" y="138" fontSize="16" textAnchor="middle" className="heart">💞</text>
            {/* 모닥불 */}
            <text x="222" y="186" fontSize="38" textAnchor="middle" className="fire">🔥</text>
            <circle cx="214" cy="140" r="2" className="spark" />
            <circle cx="230" cy="132" r="1.6" className="spark spark--b" />
            <circle cx="222" cy="122" r="1.4" className="spark spark--c" />
          </g>
        )}
      </svg>
    </figure>
  );
}
