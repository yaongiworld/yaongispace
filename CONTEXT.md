# Yaongispace

The shared world of Towee and Yangcho — the things in our life worth saving, organised
so we can find them again in ten years and so a chat agent can recall them for us.

This glossary is the vocabulary we use when talking about the app. It is not a schema
and carries no implementation detail.

## The spine

**Entry**:
The shared index over everything in the app. Every Letter, Photo, Place, Visit, Event
and Note registers one, carrying only what recall needs — what kind of thing it is,
its text, when it happened, where, and whose. Derived data: rebuildable from the things
it indexes, never the only copy of anything.
_Avoid_: Moment (means a trending lifestyle event in the LLC project — never reuse it
here), Item, Record, Object

**Occurred at**:
When a thing happened in our life. Distinct from when it was created in the app — a
letter written today about Jeju last October happened in October. The primary time axis
everywhere: timeline, map, and recall all reason in occurred-at.
_Avoid_: Date, timestamp, event date

## The things

**Letter**:
A written message from one of us to the other. Composed rather than fired off — length
and ceremony are what separate it from a chat message. Read by the chat agent for
recall, but never drafted or written by it.
_Avoid_: Message, note, mail, post

**Photo**:
An image or video we imported into our own storage. Ours, not a reference to somebody
else's copy — Google Photos cannot be read by an app, so every photo here was uploaded,
picked, or backfilled from an export.
_Avoid_: Image, media, asset, picture

**Place**:
A location on the world map. Exists whether or not we have been there — a place we hope
to go is simply a Place with no Visit yet. There is no "planned" or "visited" flag;
having a Visit is what makes it somewhere we have been.
_Avoid_: Location, destination, marker, pin, spot

**Visit**:
An occasion when we were at a Place. Three trips to Jeju are three Visits to one Place.
_Avoid_: Trip (that is a Journey), stay, check-in

**Journey**:
A named span of travel that gathers the Photos, Visits, Events and Letters belonging to
it — "Jeju, October 2025". Exists so a trip can be opened and seen as one thing years
later, rather than inferred from scattered dates.
_Avoid_: Trip, vacation, holiday, collection, album

**Event**:
Something on our shared calendar. Lives in one dedicated shared Google Calendar that we
both have edit rights to, and is mirrored here.
_Avoid_: Appointment, meeting, calendar item

**Note**:
Something written down for ourselves rather than to each other — the knowledge base the
chat agent draws on. A Letter is addressed; a Note is not.
_Avoid_: Document, page, entry (Entry means the shared index), memo, KB article

**Person**:
One of us. Exactly two, and deliberately thin — an identity a Letter can be addressed
to or a Photo can be about. Carries no contact details, no relationship history, and no
last-contacted tracking; that is the SNS work, which is out of scope.
_Avoid_: User, contact, member, account

## Recall

**Recall**:
Answering a question about our own life by reading across Entries — "when did we go to
Jeju?", "what did Yangcho say about Busan?". Read-only.
_Avoid_: Search, query, RAG, chat
