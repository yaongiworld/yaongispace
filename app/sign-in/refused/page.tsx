/**
 * The warm refusal.
 *
 * Somebody signed in with Google successfully and is simply not one of us.
 * That is not an error and must not read like one: no status code, no stack
 * trace, no "Access Denied" in red. It is a small private house whose door
 * happens to be locked, and the person at it has done nothing wrong.
 *
 * It also says nothing about who *is* allowed in, and offers no way to ask —
 * an appeal form would be a support burden for a house with two residents.
 * The one affordance is to try a different Google account, because the likely
 * visitor here is one of us signed into the wrong one.
 */

export const metadata = {
  title: "조용한 문 앞 · 야옹이월드",
};

export default function RefusedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-12">
      <section
        className="flex w-full flex-col items-center gap-5 bg-clay-card px-6 py-10 text-center"
        style={{
          borderRadius: "var(--radius-clay-lg)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <p className="text-5xl" aria-hidden="true">
          🐈
        </p>

        <h1 className="text-2xl text-clay-ink" style={{ fontFamily: "var(--font-display)" }}>
          여기는 작은 집이에요
        </h1>

        <p className="text-base leading-relaxed text-clay-ink">
          두 사람만 사는 공간이라
          <br />
          문을 열어드리지 못했어요.
        </p>

        <p className="text-sm leading-relaxed text-clay-ink-soft">
          혹시 다른 구글 계정으로 들어오셨나요?
        </p>

        <a
          href="/auth/start"
          className="mt-1 bg-white px-6 py-3 text-sm text-clay-ink transition-transform active:scale-[0.98]"
          style={{
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          다른 계정으로 다시 시도하기
        </a>
      </section>
    </main>
  );
}
