import type { Cat } from "@/lib/couple";

/**
 * A place an image will go (brief §6). Today it holds a 🐱 (or the emoji it
 * is given); the image room replaces it by `id`, and because the box has a
 * fixed size and a 1:1 ratio, swapping in a picture cannot move the layout.
 *
 * `data-image-id` is the name tag: `cat-face-yangcho`, `cat-face-tawee`,
 * `item-ribbon`, … — grep for it to find every slot.
 */
export function ImageSlot({
  id,
  size,
  cat,
  emoji = "🐱",
  label,
  className = "",
}: {
  id: string;
  size: number;
  /** Tints the slot coral (양초) or sky (토위). */
  cat?: Cat;
  emoji?: string;
  /** Spoken name; omit for a decorative slot. */
  label?: string;
  className?: string;
}) {
  const tint =
    cat === "yangcho"
      ? "color-mix(in srgb, var(--color-clay-berry) 18%, white)"
      : cat === "towee"
        ? "color-mix(in srgb, var(--color-clay-sky) 22%, white)"
        : "var(--color-clay-card)";
  const ring =
    cat === "yangcho" ? "var(--color-clay-berry)" : cat === "towee" ? "var(--color-clay-sky)" : "transparent";

  return (
    <span
      data-image-id={id}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-grid shrink-0 place-items-center select-none ${className}`}
      style={{
        width: size,
        height: size,
        aspectRatio: "1 / 1",
        borderRadius: "50%",
        background: tint,
        boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${ring} 55%, transparent), var(--shadow-clay)`,
        fontSize: Math.round(size * 0.56),
        lineHeight: 1,
      }}
    >
      {emoji}
    </span>
  );
}

/** The image id for each cat's face. 토위's keeps the brief's `tawee` spelling. */
export const CAT_FACE_ID: Record<Cat, string> = {
  yangcho: "cat-face-yangcho",
  towee: "cat-face-tawee",
};
