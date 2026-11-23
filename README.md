# Season Capsules

Press play on this season's playlist, and keep the memories that go with it.

Each season (Fall 2026, a semester, a trip — any dates) gets a Spotify playlist.
Every day you open the app, hit **Play**, and optionally jot a note, add a
memory (tied to a specific song if you want), or drop in photos. The app
remembers which songs you actually played each day, and at the end of the
season it builds a **capsule**: your soundtrack, top artists, loudest day, and
the whole story in order. "On this day" brings back what you were playing and
writing one, two, or three years ago.

This is a personal prototype. It is separate from the Life Soundtracks
(memory care) idea.

## How music connects

| Job | How | Why |
|---|---|---|
| Press play | The Play button opens the season playlist in the Spotify app | Needs no Spotify API approval, so no user cap |
| Know what played, and when | Last.fm, which logs every Spotify play once linked | Spotify's own API caps small apps at a handful of Premium test users |
| Notes, memories, photos | Stored on the device (IndexedDB) | Private, works offline |

## Run it

No build step and no dependencies.

```bash
cd ~/Desktop/SeasonCapsules
python3 -m http.server 8765
```

Then open http://localhost:8765.

### On your phone

Phones need the app served over **https** to install it to the home screen and
work offline. The easiest way is free static hosting (GitHub Pages, Netlify,
or Cloudflare Pages): upload this folder, open the URL in Safari, then
Share → **Add to Home Screen**.

For a quick look on the same wifi, run the server with `--bind 0.0.0.0` and
open `http://<your-mac's-ip>:8765` on the phone (no offline/install support
over plain http).

## Set up listening history (one time)

1. Make a free account at [last.fm](https://www.last.fm/join).
2. Link Spotify: last.fm → Settings → Applications → Spotify.
   From then on, every song you play is logged.
3. Create a free API key at [last.fm/api/account/create](https://www.last.fm/api/account/create).
4. In the app: Settings → enter your username and key → Save & test.

Last.fm only logs plays from the moment you connect it. The longer it's
connected, the better your capsules get.

## Season recap

When a season ends, Today shows **Your … recap is ready** for 30 days. Tap
through full-screen slides: your song of the season, top 5, hours listened
(estimated at 3.5 min per play), top artist, loudest day and what you wrote,
the songs you tied memories to, a photo collage, and the first and last songs
of the season. The last slide makes a 1080x1920 share image. Capsule → *Preview
your recap so far* works mid-season.

## Your data

Everything stays on the device that created it. Use Settings → **Export
backup** now and then (it includes photos). **Import backup** restores it on
another device or browser.

The Last.fm API key is stored in the browser. That's fine for personal use;
a public version would move Last.fm calls behind a small server.

## Project layout

```
index.html            app shell
css/styles.css        styles
js/logic.js           pure logic: seasons, dates, Spotify links, Last.fm parsing, stats (tested)
js/db.js              IndexedDB + localStorage storage, backup/restore
js/lastfm.js          Last.fm listening history
js/recap.js           end-of-season recap slides + share image
js/app.js             UI: Today, Capsule, Settings
sw.js                 offline cache (bump VERSION when files change)
manifest.webmanifest  home-screen install
tests/                ./tests/run.sh (uses Node, or macOS's built-in JavaScriptCore)
```

## Ideas for next

- Home-screen / lock-screen widget for a one-tap note (needs a native app)
- Native iOS app with Apple MusicKit, so music can play inside the app
- Printed season book
- Reminders: "One year ago today…" notification
