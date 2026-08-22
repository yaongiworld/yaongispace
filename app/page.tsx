import { SectionPage } from "./SectionPage";

/**
 * 홈 — Home.
 *
 * Ticket 01 used this route as a font specimen: it rendered Korean at every
 * weight and face so tofu or a broken subset would be obvious immediately. That
 * job is done — the faces are verified and the specimen would now be the first
 * thing you see every time you open the app, which is not what home is for.
 *
 * Ticket 06 makes this a hearth: the hero cat upper-centre, News as a single
 * quiet line beneath it. Until then it is an empty themed page like its five
 * neighbours.
 *
 * **There is no shortcut grid here and there must not be one.** It duplicated
 * the tab bar and would push the cat below the fold; the decision to drop it is
 * what freed the sixth tab slot for the calendar. If a future session is
 * tempted to add one, read CLAUDE.md, "Home is a hearth, not a dashboard".
 */
export default function HomePage() {
  return <SectionPage title="야옹이월드" />;
}
