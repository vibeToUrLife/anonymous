# Firestore rules to add for the Pet World

This repo keeps **Realtime Database** rules in `database.rules.json` (already updated for the
World's `world/*` subtree). **Firestore** rules are managed in the Firebase Console, so there is
no `firestore.rules` file to edit here. The World needs **one new Firestore rule** — add it to
your Console ruleset (merge into the existing `match /databases/{database}/documents { … }`),
do **not** replace the whole ruleset:

```
// Player-submitted moderation reports from the Pet World.
// Any signed-in user may CREATE a report about themselves as the reporter;
// only admins should read/resolve them (reuse your existing admin check).
match /moderation_reports/{reportId} {
  allow create: if request.auth != null
                && request.resource.data.reporterUid == request.auth.uid
                && request.resource.data.text.size() <= 200;
  allow read, update, delete: if false; // tighten to your admin rule, e.g. isAdmin()
}
```

## Notes on existing collections (no rule changes needed if owners can already write their own doc)

The World also writes three new **fields** onto the player's own `rooms/{uid}` document
(`worldPet`, `worldColor`, `worldOutfit`) via a `merge` write, and reads `ownedAccessories`
from it. These reuse the document the room already reads/writes, so your existing
`rooms/{uid}` owner-write rule covers them — no change required.

## Read/write cost

- Position/presence sync is **Realtime Database**, not Firestore — Firestore is untouched by
  the live loop.
- Firestore writes from the World are only the infrequent, user-initiated avatar-persist
  (`rooms/{uid}` merge) and the rare moderation report. No polling, no per-frame writes.

## Until the rule is added

Report writes fail-safe (`.catch(() => {})`), so the feature just won't persist reports yet —
nothing breaks.
