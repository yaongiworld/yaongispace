# The home-screen cat uses CSS 3D, not WebGL

The brief asked for 3D animation, so a future reader will see CSS transforms on a flat
image and assume real 3D was planned and never finished. It was built and measured, and
lost on the evidence.

All three approaches were prototyped live at phone size: CSS bob, CSS 3D transforms, and a
real three.js scene.

| | Added weight | Battery | Distinguishable at 132px? |
| --- | --- | --- | --- |
| CSS bob | 0 KB | negligible | — |
| **CSS 3D transforms** | **0 KB** | **negligible** | barely, vs. WebGL |
| WebGL (three.js) | ~600 KB | measurably warm | not enough to justify it |

Perceived liveliness comes from the **reaction**, not the rendering — a squash-and-sparkle
on tap does more emotional work than real geometry. Building the WebGL version also
exposed a hidden dependency: real 3D needs a real *modelled* cat, a far larger job than
adding an animation.

## Consequences

The hero is a flat asset with perspective tilt on its idle bob and a spin on tap: zero
extra bytes, GPU-composited, degrades to a still image under `prefers-reduced-motion`, and
works offline.

Because the hero is a plain swappable image, the cat gains **moods** for free — heart-eyes
when a letter waits, weary at 2am — which is a better answer to "charming at first,
grating by week three" than any single expression.

WebGL is not ruled out forever. It earns its cost only if the cat becomes something
genuinely manipulated — dressed, posed, played with. Revisit then, not before.
