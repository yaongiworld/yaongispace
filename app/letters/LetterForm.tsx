/**
 * Writing a Letter.
 *
 * Shared by 새 편지 and 고쳐 쓰기, because they are the same act: a Letter is
 * editable until it is read, so revising one is simply writing it again. The
 * database is what closes that window (migration 002), not this form.
 *
 * The body is set in Gaegu as you type it, so what you are writing looks like
 * what will be read. Composed rather than fired off — the textarea is tall on
 * purpose.
 */

export function LetterForm({
  action,
  recipientName,
  letter,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Who it is addressed to — 토위 or 양초, never a legal name. */
  recipientName: string;
  letter?: {
    id: string;
    title: string | null;
    body: string;
    unsealAt: Date | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {letter && <input type="hidden" name="id" value={letter.id} />}

      <p className="text-sm text-clay-ink-soft">{recipientName}에게</p>

      <input
        name="title"
        type="text"
        defaultValue={letter?.title ?? ""}
        placeholder="제목 (없어도 괜찮아요)"
        maxLength={120}
        className="bg-clay-card px-5 py-4 text-base text-clay-ink outline-none placeholder:text-clay-ink-soft"
        style={{
          borderRadius: "var(--radius-clay)",
          boxShadow: "var(--shadow-clay)",
        }}
      />

      <textarea
        name="body"
        required
        rows={14}
        defaultValue={letter?.body ?? ""}
        placeholder="하고 싶은 말을 적어요"
        className="resize-none bg-clay-card px-5 py-4 text-lg leading-loose text-clay-ink outline-none placeholder:text-clay-ink-soft"
        style={{
          borderRadius: "var(--radius-clay)",
          boxShadow: "var(--shadow-clay)",
          fontFamily: "var(--font-letter)",
        }}
      />

      <label
        className="flex flex-col gap-2 bg-clay-card px-5 py-4"
        style={{
          borderRadius: "var(--radius-clay)",
          boxShadow: "var(--shadow-clay)",
        }}
      >
        <span className="text-sm text-clay-ink">언제 열어볼 수 있게 할까요?</span>
        {/* Optional, and empty means "now". A sealed letter is invisible to
            its recipient until this date — no countdown, nothing that says it
            exists. */}
        <input
          type="date"
          name="unseal_on"
          defaultValue={toDateInput(letter?.unsealAt ?? null)}
          className="bg-transparent text-base text-clay-ink outline-none"
        />
        <span className="text-xs text-clay-ink-soft">
          비워두면 바로 읽을 수 있어요. 날짜를 정하면 그날까지 편지가 있다는 것도
          보이지 않아요.
        </span>
      </label>

      <button
        type="submit"
        className="flex items-center justify-center px-6 py-4 text-base text-clay-ink transition-transform active:scale-[0.98]"
        style={{
          background: "var(--color-clay-rose)",
          borderRadius: "var(--radius-clay-pill)",
          boxShadow: "var(--shadow-clay-lift)",
        }}
      >
        {submitLabel}
      </button>
    </form>
  );
}

/** A `<input type="date">` wants YYYY-MM-DD, in Seoul. */
function toDateInput(date: Date | null): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}
