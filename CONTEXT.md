# Yaongispace

The shared world of Towee and Yangcho — the things in our life worth saving, organised
so we can find them again in ten years and so a chat agent can recall them for us.

This glossary is the vocabulary we use when talking about the app. It is not a schema
and carries no implementation detail.

## The spine

**Entry**:
The shared index over everything in the app. Every Letter, Photo, Place, Visit, Event
and Note registers one, carrying only what recall needs — what kind of thing it is,
its text, when it happened, where, and whose — plus an embedding and a Korean-aware
search index, which is what makes Recall possible. Derived data: rebuildable from the
things it indexes, never the only copy of anything.
_Avoid_: Moment (means a trending lifestyle event in the LLC project — never reuse it
here), Item, Record, Object

**Occurred at**:
When a thing happened in our life. Distinct from when it was created in the app — a
letter written today about Jeju last October happened in October. The primary time axis
everywhere: timeline, map, and recall all reason in occurred-at.
**The one exception is News**, which orders by when a thing *arrived* (`created_at`),
not when it happened — otherwise today's letter about last October sorts into last
October, and a Takeout backfill floods the feed with 2022
([ADR-0015](docs/adr/0015-news-is-a-derived-feed.md)). A sealed letter's news fires on
its unseal date. Nothing else departs from occurred-at.
_Avoid_: Date, timestamp, event date

**News**:
What the other person has done lately — a derived feed over recent Entries, never a
stored table. Always someone else's doing: you never see your own actions reflected
back. A short rolling window, **not** a history; the timeline, the Journey and Recall
are where history lives. Seeing a Letter mentioned in News is not reading it — only
opening the Letter itself seals it.
_Avoid_: Notification (that is the delivery mechanism, deferred), activity, feed, alert

## The things

**Letter**:
A written message from one of us to the other. Composed rather than fired off — length
and ceremony are what separate it from a chat message. Read by the chat agent for
recall, but never drafted or written by it.
_Avoid_: Message, note, mail, post

**Photo**:
An image or video we chose to keep, imported into our own storage. Ours, not a reference
to somebody else's copy — Google Photos cannot be read by an app, so every photo here was
uploaded or backfilled from an export. **A Photo is one we picked**: the library is
curated, not complete (see Curated library). Its original bytes are never rewritten —
edits become a Rendition or a stored correction, never a change to the original.
_Avoid_: Image, media, asset, picture

**Curated library**:
What the Photos section is: the subset of our photos worth looking at, not everything we
have ever taken. Google Photos remains the archive of record; Yaongispace holds the ones
we chose. The selection is itself the valuable thing — which photo out of eleven
near-identical ones is the good one is judgement no backup elsewhere holds — so an export
is only complete if it carries the selection, not just the bytes.
_Avoid_: Backup, archive, mirror, sync (nothing here mirrors Google Photos)

**Rendition**:
A derived version of a Photo — a thumbnail, a display size, a rotated copy. Generated
once at import and stored beside the original, never in place of it. Rebuildable from the
original, so losing one costs nothing.
_Avoid_: Version, variant, edit, derivative, resize

**Place**:
A location on the world map. Exists whether or not we have been there — a place we hope
to go is simply a Place with no Visit yet. There is no "planned" or "visited" flag;
having a Visit is what makes it somewhere we have been.
_Avoid_: Location, destination, marker, pin, spot

**Visit**:
An occasion when we were at a Place. Three trips to Jeju are three Visits to one Place.
_Avoid_: Trip (that is a Journey), stay, check-in

**Journey**:
A named span of our life that gathers the Photos, Visits, Events and Letters belonging to
it — "Jeju, October 2025", "이사", "the year we got married". Exists so a stretch of time
can be opened and seen as one thing years later, rather than inferred from scattered
dates. Travel is the commonest kind of Journey, not the definition of one
([ADR-0014](docs/adr/0014-journey-is-a-named-span-of-life.md)). **Optional** — the
timeline is the substrate, Journeys are lenses over it; a Photo in no Journey is still a
first-class Photo. This is also what a Google Photos **album** becomes on import: albums
are a Takeout-boundary word, never an app concept.
_Avoid_: Trip, vacation, holiday, collection, album

**Event**:
Something on our shared calendar — an anniversary, a trip, a thing to look forward to.
Native to Yaongispace: ours, not a mirror of Google Calendar. If Google sync is added
later it becomes a mirror onto Events we already own, never the other way round.
_Avoid_: Appointment, meeting, calendar item

**Note**:
Something written down for ourselves rather than to each other — the knowledge base
Recall draws on. A Letter is addressed; a Note is not. Freeform: a title and a body,
nothing typed or required.
_Avoid_: Document, page, entry (Entry means the shared index), memo, KB article

**Person**:
One of us. Exactly two, and deliberately thin — an identity a Letter can be addressed
to or a Photo can be about. **Everything belongs to a Person, never to a Google
account**; a Google account is only a Credential attached to one. Carries no contact
details, no relationship history, and no last-contacted tracking; that is the SNS work,
which is out of scope.
_Avoid_: User, contact, member, account

**Credential**:
A way for a Person to sign in — currently a Google account, later perhaps an email link
or the voice ritual. Attached to a Person and replaceable; losing one loses access, never
data.
_Avoid_: Login, identity, account

## Recall

**Recall**:
Answering a question about our own life by reading across Entries — "when did we go to
Jeju?", "what did Yangcho say about Busan?". Read-only, and **always shows the Entries
an answer came from**; an answer without its sources is a claim, not a memory. Reads
photo captions and metadata, never the photographs themselves.
_Avoid_: Search, query, RAG, chat, assistant

**Under-claiming**:
What Recall does when it is unsure — offering the Entries it found and saying so, rather
than composing a confident answer. Preferred always: a shrug is recoverable, a confident
wrong claim about our shared history is not.
_Avoid_: Hedging, low confidence, fallback
