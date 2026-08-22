import { NextResponse, type NextRequest } from "next/server";

/**
 * Where the phone's share sheet delivers photos.
 *
 * ## This handler should almost never run
 *
 * That is not a defect; it is the design. A share target POSTs
 * `multipart/form-data` to this URL, and if that POST reached Vercel it would
 * be carrying 40 originals — exactly the bytes ADR-0012 says must never transit
 * our servers. So **the service worker intercepts it** (`public/sw.js`): it
 * takes the files out of the POST on the device, stashes them in IndexedDB, and
 * redirects to the review grid, which reads them locally. Nothing leaves the
 * phone until the review grid has been through and the uploads go straight to
 * R2.
 *
 * This handler is the fallback for the window in which that is not true:
 *
 *   - the very first share after install, before the service worker has
 *     activated;
 *   - a browser with service workers unavailable or disabled.
 *
 * In that window a share would otherwise fail with a bare error. Instead it
 * redirects to the review page, which offers its own file picker. The person
 * has to pick the photos again, which is mildly annoying and much better than a
 * dead share sheet — and it is also the iOS path, since iOS implements no share
 * target at all.
 *
 * **It deliberately does not read the body.** Consuming the multipart stream
 * would mean the originals really did arrive here. Redirecting without reading
 * it is the honest thing: the bytes are dropped, not stored.
 */
export async function POST(request: NextRequest) {
  /* 303, not 302: the response to a POST must become a GET, or the browser
     re-POSTs to the redirect target and the review page sees a request method
     it does not answer. */
  return NextResponse.redirect(new URL("/photos/review?shared=1", request.url), 303);
}

/**
 * A plain visit to the share-target URL.
 *
 * Nobody navigates here on purpose, but a share sheet that fires a GET — or a
 * person who bookmarked the URL — should land on the review grid rather than a
 * 405.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/photos/review", request.url), 307);
}
