import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';

/**
 * 고양이 임시 표기 (정식 캐릭터 디자인 전). 둘 다 🐱이고, 양초는 파랑 / 타위는 코랄 원 안에 들어가요.
 * 색만으로 구분하지 않도록 이름과 함께 쓰는 것을 원칙으로 해요.
 */
export function CatMark({ who, size = 'md' }: { who: PersonId; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`cat cat--${who} cat--${size}`} aria-hidden>
      {PEOPLE[who].emoji}
    </span>
  );
}

/** 🐱 + 이름 (색 라벨). 예: 파란 원 🐱 양초 */
export function PersonTag({ who }: { who: PersonId }) {
  return (
    <span className={`ptag ptag--${who}`}>
      <CatMark who={who} size="sm" /> {PEOPLE[who].name}
    </span>
  );
}
