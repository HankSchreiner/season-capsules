/**
 * Season Capsules — pure logic (no DOM, no storage, no network).
 * Everything here is unit-tested in tests/logic.test.js.
 *
 * Day keys are local-time 'YYYY-MM-DD' strings. They sort and compare
 * correctly as plain strings, which the season lookups rely on.
 */
var Logic = (function () {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Local-time day key for a Date. */
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Date at local midnight for a day key. */
  function parseKey(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /** Day key `n` days after `key` (n may be negative). DST-safe. */
  function addDays(key, n) {
    var d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  /** Unix-second bounds [from, to] covering the whole local day. */
  function dayRange(key) {
    var start = parseKey(key);
    var end = parseKey(addDays(key, 1));
    return { from: Math.floor(start.getTime() / 1000), to: Math.floor(end.getTime() / 1000) - 1 };
  }

  /** Unix-second bounds covering every day from startKey through endKey. */
  function keyRange(startKey, endKey) {
    return { from: dayRange(startKey).from, to: dayRange(endKey).to };
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /** "Mon, Nov 23" style label. */
  function prettyDay(key, withYear) {
    var d = parseKey(key);
    var s = WEEKDAYS[d.getDay()].slice(0, 3) + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    return withYear ? s + ', ' + d.getFullYear() : s;
  }

  /**
   * Default season containing `key`, using calendar seasons by month:
   * Spring Mar–May, Summer Jun–Aug, Fall Sep–Nov, Winter Dec–Feb.
   * Winter spans two years and is named "Winter 2026–27".
   */
  function defaultSeasonFor(key) {
    var d = parseKey(key);
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var name, start, end;
    if (m >= 3 && m <= 5) { name = 'Spring ' + y; start = y + '-03-01'; end = y + '-05-31'; }
    else if (m >= 6 && m <= 8) { name = 'Summer ' + y; start = y + '-06-01'; end = y + '-08-31'; }
    else if (m >= 9 && m <= 11) { name = 'Fall ' + y; start = y + '-09-01'; end = y + '-11-30'; }
    else {
      var wy = m === 12 ? y : y - 1;
      name = 'Winter ' + wy + '–' + pad((wy + 1) % 100);
      start = wy + '-12-01';
      end = addDays((wy + 1) + '-03-01', -1); // last day of Feb, leap-safe
    }
    return { name: name, start: start, end: end, playlistUrl: '' };
  }

  /** The season covering `key`, or null. Latest start wins if seasons overlap. */
  function seasonForDate(seasons, key) {
    var best = null;
    for (var i = 0; i < seasons.length; i++) {
      var s = seasons[i];
      if (s.start <= key && key <= s.end && (!best || s.start > best.start)) best = s;
    }
    return best;
  }

  /** Seasons newest first. */
  function sortSeasons(seasons) {
    return seasons.slice().sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });
  }

  /** Every day key from start through end (inclusive), capped at today if given. */
  function daysIn(start, end, todayKey) {
    var last = todayKey && todayKey < end ? todayKey : end;
    var out = [];
    for (var k = start; k <= last; k = addDays(k, 1)) out.push(k);
    return out;
  }

  /**
   * Parse a Spotify share link or URI into links we can open.
   * Accepts https://open.spotify.com/(intl-xx/)playlist/ID?si=..., album links,
   * and spotify:playlist:ID URIs. Returns null if it isn't one.
   */
  function parseSpotifyUrl(url) {
    if (!url) return null;
    url = String(url).trim();
    var m = url.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/) ||
            url.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album)\/([A-Za-z0-9]+)/i);
    if (!m) return null;
    var type = m[1].toLowerCase(), id = m[2];
    return {
      type: type,
      id: id,
      web: 'https://open.spotify.com/' + type + '/' + id,
      uri: 'spotify:' + type + ':' + id
    };
  }

  /**
   * Last.fm user.getRecentTracks JSON -> [{name, artist, album, image, uts}].
   * Drops the "now playing" row (it has no timestamp yet). Last.fm returns a
   * bare object instead of an array when there is exactly one track.
   */
  function normalizeTracks(json) {
    var rt = json && json.recenttracks;
    if (!rt || !rt.track) return [];
    var list = Array.isArray(rt.track) ? rt.track : [rt.track];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t['@attr'] && t['@attr'].nowplaying === 'true') continue;
      if (!t.date || !t.date.uts) continue;
      var img = '';
      if (Array.isArray(t.image)) {
        for (var j = t.image.length - 1; j >= 0; j--) {
          if (t.image[j]['#text']) { img = t.image[j]['#text']; break; }
        }
      }
      out.push({
        name: t.name || '',
        artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
        album: (t.album && t.album['#text']) || '',
        image: img,
        uts: +t.date.uts
      });
    }
    return out;
  }

  /** Total pages reported by a getRecentTracks response (1 if unknown). */
  function totalPages(json) {
    var a = json && json.recenttracks && json.recenttracks['@attr'];
    return a && +a.totalPages > 0 ? +a.totalPages : 1;
  }

  /** Group tracks into {dayKey: [tracks oldest-first]} by local time. */
  function bucketByDay(tracks) {
    var out = {};
    for (var i = 0; i < tracks.length; i++) {
      var k = dateKey(new Date(tracks[i].uts * 1000));
      (out[k] = out[k] || []).push(tracks[i]);
    }
    for (var key in out) out[key].sort(function (a, b) { return a.uts - b.uts; });
    return out;
  }

  function songId(t) { return (t.artist + '\u0000' + t.name).toLowerCase(); }

  /** Most-played songs: [{name, artist, image, plays}], ties broken by name. */
  function topTracks(tracks, n) {
    var map = {};
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i], id = songId(t);
      if (!map[id]) map[id] = { name: t.name, artist: t.artist, image: t.image, plays: 0 };
      map[id].plays++;
      if (!map[id].image && t.image) map[id].image = t.image;
    }
    return rank(map, n);
  }

  /** Most-played artists: [{name, plays}]. */
  function topArtists(tracks, n) {
    var map = {};
    for (var i = 0; i < tracks.length; i++) {
      var a = tracks[i].artist, id = a.toLowerCase();
      if (!map[id]) map[id] = { name: a, plays: 0 };
      map[id].plays++;
    }
    return rank(map, n);
  }

  function rank(map, n) {
    var arr = [];
    for (var k in map) arr.push(map[k]);
    arr.sort(function (a, b) { return b.plays - a.plays || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    return n ? arr.slice(0, n) : arr;
  }

  /** True if a journal entry has anything in it. */
  function entryHasContent(e) {
    return !!(e && ((e.note && e.note.trim()) || (e.moments && e.moments.length) || (e.photos && e.photos.length)));
  }

  /**
   * Stats for a season's capsule.
   *   entries:  {dayKey: entry}
   *   playsByDay: {dayKey: [tracks]}
   */
  function capsuleStats(season, entries, playsByDay, todayKey) {
    var days = daysIn(season.start, season.end, todayKey);
    var all = [], journaled = 0, photos = 0, moments = 0, busiest = null;
    for (var i = 0; i < days.length; i++) {
      var k = days[i];
      var plays = playsByDay[k] || [];
      all = all.concat(plays);
      if (!busiest || plays.length > busiest.plays) busiest = { day: k, plays: plays.length };
      var e = entries[k];
      if (entryHasContent(e)) journaled++;
      if (e && e.photos) photos += e.photos.length;
      if (e && e.moments) moments += e.moments.length;
    }
    return {
      days: days.length,
      journaledDays: journaled,
      photos: photos,
      moments: moments,
      plays: all.length,
      uniqueSongs: topTracks(all).length,
      topTracks: topTracks(all, 10),
      topArtists: topArtists(all, 5),
      busiestDay: busiest && busiest.plays > 0 ? busiest : null
    };
  }

  /**
   * Past-year day keys with the same month and day as `key` that have an entry
   * or plays, newest first. Feb 29 only matches other Feb 29s.
   */
  function onThisDay(key, knownKeys) {
    var md = key.slice(4), year = +key.slice(0, 4), out = [];
    for (var i = 0; i < knownKeys.length; i++) {
      var k = knownKeys[i];
      if (k.slice(4) === md && +k.slice(0, 4) < year && out.indexOf(k) < 0) out.push(k);
    }
    return out.sort().reverse();
  }

  function yearsAgo(fromKey, toKey) {
    var n = +toKey.slice(0, 4) - +fromKey.slice(0, 4);
    return n === 1 ? '1 year ago' : n + ' years ago';
  }

  var AVG_SONG_MINUTES = 3.5; // Last.fm logs plays, not durations, so listening time is estimated

  /**
   * Everything the end-of-season recap shows. Pure data: photos are returned
   * as {day, id} references, never blobs. Slides with nothing to show come
   * back empty/null so the UI can skip them.
   */
  function recapData(season, entries, playsByDay, todayKey) {
    var stats = capsuleStats(season, entries, playsByDay, todayKey);
    var days = daysIn(season.start, season.end, todayKey);
    var all = [];
    for (var i = 0; i < days.length; i++) all = all.concat(playsByDay[days[i]] || []);
    all.sort(function (a, b) { return a.uts - b.uts; });

    var top = stats.topTracks[0] || null, topSong = null;
    if (top) {
      var id = songId(top), first = null;
      for (var j = 0; j < all.length; j++) if (songId(all[j]) === id) { first = all[j]; break; }
      topSong = { name: top.name, artist: top.artist, image: top.image, plays: top.plays,
                  firstDay: first ? dateKey(new Date(first.uts * 1000)) : null };
    }

    var loudest = null;
    if (stats.busiestDay) {
      var lk = stats.busiestDay.day, le = entries[lk];
      loudest = { day: lk, plays: stats.busiestDay.plays, topTracks: topTracks(playsByDay[lk] || [], 3),
                  note: le && le.note ? le.note.trim() : '' };
    }

    var songMemories = [], photos = [];
    var entryDays = Object.keys(entries).sort();
    for (var k = 0; k < entryDays.length; k++) {
      var dk = entryDays[k], e = entries[dk];
      if (dk < season.start || dk > season.end) continue;
      (e.moments || []).forEach(function (m) { if (m.song) songMemories.push({ day: dk, song: m.song, text: m.text || '' }); });
      (e.photos || []).forEach(function (p) { photos.push({ day: dk, id: p.id }); });
    }

    var bookend = function (t) { return t ? { name: t.name, artist: t.artist, image: t.image, day: dateKey(new Date(t.uts * 1000)) } : null; };
    return {
      season: season,
      finished: !!todayKey && todayKey > season.end,
      stats: stats,
      hours: Math.round(all.length * AVG_SONG_MINUTES / 60),
      topSong: topSong,
      topArtist: stats.topArtists[0] || null,
      loudest: loudest,
      songMemories: songMemories,
      photos: photos,
      firstSong: bookend(all[0]),
      lastSong: all.length > 1 ? bookend(all[all.length - 1]) : null,
      isEmpty: all.length === 0 && stats.journaledDays === 0
    };
  }

  /** Seasons that ended within the last `withinDays` days, newest first. */
  function recentlyEndedSeasons(seasons, todayKey, withinDays) {
    var cutoff = addDays(todayKey, -withinDays);
    return sortSeasons(seasons.filter(function (s) { return s.end < todayKey && s.end >= cutoff; }));
  }

  /** Short random id for photos and moments. */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    dateKey: dateKey, parseKey: parseKey, addDays: addDays, dayRange: dayRange, keyRange: keyRange,
    prettyDay: prettyDay, defaultSeasonFor: defaultSeasonFor, seasonForDate: seasonForDate,
    sortSeasons: sortSeasons, daysIn: daysIn, parseSpotifyUrl: parseSpotifyUrl,
    normalizeTracks: normalizeTracks, totalPages: totalPages, bucketByDay: bucketByDay,
    topTracks: topTracks, topArtists: topArtists, entryHasContent: entryHasContent,
    capsuleStats: capsuleStats, onThisDay: onThisDay, yearsAgo: yearsAgo, uid: uid,
    recapData: recapData, recentlyEndedSeasons: recentlyEndedSeasons
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
