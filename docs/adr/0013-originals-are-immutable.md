# Original photo bytes are never rewritten

A Photo's original file is **write-once**. Rotating it, correcting a wrong date, cropping
it, or adjusting it in any way never modifies the stored original — those produce a
derivative file or a database field, and the original bytes stay exactly as imported.
Deleting a Photo tombstones it rather than erasing it.

## Why this is worth an ADR

Because the obvious implementation is the other one. Rotating an image in place is one
line, saves storage, and is what almost every app does. A future reader will find
renditions and tombstones and wonder why we made it complicated.

The answer is that Yaongispace is a **keepsake archive**, not a photo editor. The whole
point is that something put in today is still there, unchanged, in twenty years. An
in-place edit is a silent, unrecoverable overwrite of an irreplaceable thing — and the
edits most likely to be wrong (an auto-rotation from bad EXIF, a date "correction") are
exactly the ones that would destroy the original without anyone noticing until far too
late.

This is also the property that is **expensive to retrofit**. Adding immutability later
cannot recover bytes already overwritten; the photos damaged in the meantime are simply
gone. It has to be true from the first import or it is never fully true.

## What it costs

Storage, and some of it. A rotated photo means keeping both the original and the rotated
rendition rather than one file. At curated volume — a subset of a 139GB library, not the
whole thing — this is a few dollars a year, which is a trivial price for the guarantee.

It also means edits live in two places: derivative files in storage, and correction
fields in the database. Anything displaying a Photo composes the original with its
corrections rather than reading a single finished file. That is real complexity, accepted
knowingly.

## The consequence worth stating plainly

**Yaongispace cannot damage a photo.** Every operation the app offers is additive. The
worst a bug can do is produce a bad rendition or a wrong metadata field, both of which are
fixable, because the thing they were derived from is still there.
