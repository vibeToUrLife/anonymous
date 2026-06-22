/**
 * seed-chengyu-dict.js — ONE-TIME developer tool to sync the server dictionary.
 *
 * WHY: 成语接龙 validates a word twice — the browser checks the CHENGYU list
 * (chengyu-data.js), and the Firestore security rule re-checks that a doc with
 * the same id exists in the `chengyu_dict` collection (firestore.rules). If an
 * idiom is in CHENGYU but NOT in chengyu_dict, regular users get "出错了，请再试
 * 一次" while developers (who bypass the rule) succeed. This uploads EVERY key in
 * CHENGYU into chengyu_dict so the two lists always match.
 *
 * HOW TO RUN:
 *   1. Open the site in the browser and sign in with a DEVELOPER account
 *      (only developer UIDs may write chengyu_dict — see firestore.rules).
 *   2. Open DevTools → Console.
 *   3. Paste this whole file, press Enter. It starts automatically.
 *   4. If it stops on the free plan's 20,000-writes/day quota, it REMEMBERS its
 *      progress in localStorage. The next day, just paste the file again — it
 *      auto-resumes from where it stopped (no index to track by hand).
 *      To force a fresh run from the start, call `seedChengyuDict(0)`.
 *
 * Safe to re-run: it just sets each doc to {} (idempotent), so re-running only
 * overwrites with the same empty value. `db` and `CHENGYU` are page globals.
 */
async function seedChengyuDict(startAt) {
  if (typeof db === 'undefined' || typeof CHENGYU === 'undefined') {
    console.error('❌ Run this on the loaded site — `db` and `CHENGYU` must exist.');
    return;
  }
  const PROGRESS_KEY = 'seed_chengyu_dict_next';
  // No explicit start → resume from saved progress (or 0 the first time).
  if (startAt == null) startAt = parseInt(localStorage.getItem(PROGRESS_KEY) || '0', 10) || 0;
  const words = Object.keys(CHENGYU);
  const CHUNK = 500;                                    // Firestore batch write limit
  console.log(`🐉 Seeding ${words.length} idioms into chengyu_dict, from index ${startAt}…`);
  for (let i = startAt; i < words.length; i += CHUNK) {
    const batch = db.batch();
    words.slice(i, i + CHUNK).forEach(function (w) {
      batch.set(db.collection('chengyu_dict').doc(w), {});
    });
    try {
      await batch.commit();
      const done = Math.min(i + CHUNK, words.length);
      localStorage.setItem(PROGRESS_KEY, String(done));   // remember progress for next paste
      console.log(`✅ ${done}/${words.length}`);
    } catch (e) {
      console.error(`❌ Stopped at index ${i} (quota or permission). ` +
                    `Paste the file again tomorrow to auto-resume, ` +
                    `or run: seedChengyuDict(${i})`, e);
      return;
    }
  }
  localStorage.removeItem(PROGRESS_KEY);                   // clear so a future run starts fresh
  console.log('🎉 Done — server chengyu_dict now matches the client CHENGYU list.');
}

// Auto-start when pasted into the console (resumes from saved progress).
seedChengyuDict();
