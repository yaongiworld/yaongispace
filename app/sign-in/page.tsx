/**
 * The front door.
 *
 * One button. There is nothing to choose here — no email field, no sign-up, no
 * "continue as guest" — because there are exactly two people who may come in
 * and both of them have a Google account.
 *
 * Korean, hardcoded. No i18n scaffolding and no language switcher.
 */

export const metadata = {
  title: "들어가기 · 야옹이월드",
};

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-12">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1
          className="text-4xl text-clay-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          야옹이월드
        </h1>
        <p className="text-sm text-clay-ink-soft">토위와 양초의 공간</p>
      </header>

      <section
        className="flex w-full flex-col items-center gap-6 bg-clay-card px-6 py-8"
        style={{
          borderRadius: "var(--radius-clay-lg)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <p className="text-center text-base leading-relaxed text-clay-ink">
          우리 둘만의 공간이에요.
          <br />
          구글 계정으로 들어와 주세요.
        </p>

        <a
          href="/auth/start"
          className="flex w-full items-center justify-center gap-3 bg-white px-6 py-4 text-base text-clay-ink transition-transform active:scale-[0.98]"
          style={{
            borderRadius: "var(--radius-clay-pill)",
            boxShadow: "var(--shadow-clay)",
          }}
        >
          <GoogleMark />
          구글 계정으로 들어가기
        </a>

        <p className="text-center text-xs leading-relaxed text-clay-ink-soft">
          이름과 이메일만 확인해요.
          <br />
          사진이나 캘린더는 들여다보지 않아요.
        </p>
      </section>
    </main>
  );
}

/** Google's mark, inline so the page makes no request to a Google host. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
