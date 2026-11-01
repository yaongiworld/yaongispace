import type { Day } from "./day";

/**
 * 오늘의 한마디 (brief §9 남은 5가지-2): the cat says one short thing a day.
 * The same word for both of us on the same day (picked from the date), a
 * few that know what day of the week it is, and one that notices when the
 * next South America trail is close. Never a nag, never a number to beat.
 */
const WORDS = [
  "오늘도 둘이라서 든든해요 🐾",
  "물 한 잔 마시고 가요 💧",
  "하늘 한 번 올려다봐요 ☁️",
  "어깨 쭉 펴고, 숨 크게 🌿",
  "작은 것도 잘했다고 해줘요 🌼",
  "오늘 서로 칭찬 하나씩 어때요? 💕",
  "천천히 해도 괜찮아요 🐢",
  "맛있는 거 먹는 날이었으면 🍙",
  "웃는 얼굴이 제일 예뻐요 😺",
  "오늘의 나, 충분히 멋져요 ✨",
  "스트레칭 한 번이면 몸이 고마워해요 🧘",
  "남미 가는 길, 한 걸음씩 🌎",
  "따뜻하게 입고 다녀요 🧣",
  "오늘은 일찍 자는 날로 해요 🌙",
  "같이 걸으면 멀리 가요 👟",
  "좋아하는 노래 한 곡 들어요 🎧",
  "손 잡을 핑계가 필요하면 저를 써요 🐱",
  "오늘 하루도 고생 많았어요 💗",
];

const WEEKDAY: Record<number, string> = {
  1: "월요일도 둘이면 거뜬해요 💪",
  3: "한 주의 반, 벌써 여기까지 왔어요 🐾",
  5: "금요일이에요! 오늘 저녁 뭐 먹지? 🍕",
  6: "주말이에요 🌞 같이 산책 어때요?",
  0: "일요일엔 푹 쉬어도 돼요 🛋️",
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function dailyWord(day: Day, nearTrail?: { label: string; leftM: number } | null): string {
  if (nearTrail && nearTrail.leftM > 0 && nearTrail.leftM <= 2000) {
    const km = `${Math.floor(nearTrail.leftM / 1000)}.${Math.floor((nearTrail.leftM % 1000) / 100)}`;
    return `${nearTrail.label}까지 ${km}km! 거의 다 왔어요 🏔️`;
  }
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  // About one day in three, the weekday speaks instead of the list.
  if (WEEKDAY[dow] && hash(`dow:${day}`) % 3 === 0) return WEEKDAY[dow];
  return WORDS[hash(day) % WORDS.length];
}
