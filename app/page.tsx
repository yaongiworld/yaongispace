/**
 * The scaffolding page.
 *
 * Ticket 01 has nothing interactive to show, so this page does the one job
 * that matters at this stage: it renders Korean at every weight and face the
 * app will use, on the real Soft Clay ground, so that tofu or a broken
 * subset is visible immediately rather than three tickets from now.
 */

const weights = [
  { label: "Regular 400", className: "font-normal" },
  { label: "SemiBold 600", className: "font-semibold" },
  { label: "Bold 700", className: "font-bold" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1
          className="text-4xl text-clay-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          야옹이월드
        </h1>
        <p className="text-sm text-clay-ink-soft">토위와 양초의 공간</p>
      </header>

      <section
        className="flex flex-col gap-3 bg-clay-card p-6"
        style={{
          borderRadius: "var(--radius-clay-lg)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <h2 className="text-xs tracking-wide text-clay-ink-soft">본문 — Pretendard</h2>
        {weights.map(({ label, className }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-clay-ink-soft">{label}</span>
            <p className={`${className} text-base text-clay-ink`}>
              조용한 하루. 오늘은 아무 일도 없었어요.
            </p>
            <p className={`${className} text-base text-clay-ink`}>
              한글과 English가 섞인 문장 — 2026년 8월 22일
            </p>
          </div>
        ))}
      </section>

      <section
        className="flex flex-col gap-3 bg-clay-card-quiet p-6"
        style={{
          borderRadius: "var(--radius-clay)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <h2 className="text-xs tracking-wide text-clay-ink-soft">제목 — Jua / Fredoka</h2>
        <p className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
          편지가 도착했어요
        </p>
        <p
          className="text-2xl"
          style={{ fontFamily: "var(--font-display-latin)" }}
        >
          Yaongiworld
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        {["복숭아", "장미", "라일락"].map((name, i) => (
          <span
            key={name}
            className="px-4 py-2 text-sm text-clay-ink"
            style={{
              borderRadius: "var(--radius-clay-pill)",
              background: [
                "var(--color-clay-apricot)",
                "var(--color-clay-rose)",
                "var(--color-clay-lilac)",
              ][i],
              boxShadow: "var(--shadow-clay)",
            }}
          >
            {name}
          </span>
        ))}
      </section>
    </main>
  );
}
