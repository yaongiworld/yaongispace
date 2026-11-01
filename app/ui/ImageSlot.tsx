import type { Cat } from "@/lib/couple";

/**
 * The pictures that have arrived, by slot id. A slot whose id is here shows
 * the picture; every other slot keeps its emoji until the image room sends
 * one — adding a line here is the whole swap.
 *
 * The two faces are the PO-approved icons (2026-10-19), re-cropped from the
 * approved originals with the recorded `sips` crop (byte-identical at the
 * approved 128px) and kept at 256px so the Today face is sharp on a phone.
 */
export const IMAGE_SRC: Record<string, string> = {
  "cat-face-yangcho": "/cats/yangcho-face.png",
  "cat-face-tawee": "/cats/tawee-face.png",
};

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
        // A picture covers an inset ring, so a pictured slot wears it outside.
        boxShadow: IMAGE_SRC[id]
          ? `0 0 0 2.5px color-mix(in srgb, ${ring} 70%, white), var(--shadow-clay)`
          : `inset 0 0 0 2px color-mix(in srgb, ${ring} 55%, transparent), var(--shadow-clay)`,
        fontSize: Math.round(size * 0.56),
        overflow: "hidden",
        lineHeight: 1,
      }}
    >
      {IMAGE_SRC[id] ? (
        // A plain <img>: a 35KB local file at a fixed size gains nothing from
        // next/image's loader, and the slot's fixed box already prevents shift.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={IMAGE_SRC[id]}
          alt=""
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        emoji
      )}
    </span>
  );
}

/** The image id for each cat's face. 토위's keeps the brief's `tawee` spelling. */
export const CAT_FACE_ID: Record<Cat, string> = {
  yangcho: "cat-face-yangcho",
  towee: "cat-face-tawee",
};
