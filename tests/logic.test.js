/**
 * Tests for js/logic.js. Run with ./tests/run.sh
 * Works under Node or macOS JavaScriptCore (jsc loads logic.js first,
 * which defines the global `Logic`).
 */
if (typeof Logic === 'undefined') { var Logic = require('../js/logic.js'); }
var log = typeof print === 'function' ? print : console.log;
var pass = 0, fail = 0;

function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; } else { fail++; log('FAIL ' + label + '\n  got:      ' + a + '\n  expected: ' + e); }
}

// --- dates ---
eq('dateKey pads', Logic.dateKey(new Date(2026, 0, 5)), '2026-01-05');
eq('addDays across month', Logic.addDays('2026-01-31', 1), '2026-02-01');
eq('addDays backwards across year', Logic.addDays('2026-01-01', -1), '2025-12-31');
eq('addDays across US DST start', Logic.addDays('2026-03-07', 2), '2026-03-09');
var r = Logic.dayRange('2026-11-23');
eq('dayRange spans one day', r.to - r.from, 86399);
eq('dayRange from is local midnight', r.from, new Date(2026, 10, 23).getTime() / 1000);
eq('prettyDay', Logic.prettyDay('2026-11-23'), 'Mon, Nov 23');
eq('prettyDay with year', Logic.prettyDay('2026-11-23', true), 'Mon, Nov 23, 2026');

// --- default seasons ---
eq('fall', Logic.defaultSeasonFor('2026-11-23'), { name: 'Fall 2026', start: '2026-09-01', end: '2026-11-30', playlistUrl: '' });
eq('spring', Logic.defaultSeasonFor('2026-03-01').name, 'Spring 2026');
eq('summer end', Logic.defaultSeasonFor('2026-08-31').name, 'Summer 2026');
eq('winter in Dec', Logic.defaultSeasonFor('2026-12-10'), { name: 'Winter 2026–27', start: '2026-12-01', end: '2027-02-28', playlistUrl: '' });
eq('winter in Jan belongs to prior Dec', Logic.defaultSeasonFor('2027-01-15').start, '2026-12-01');
eq('winter leap year ends Feb 29', Logic.defaultSeasonFor('2028-02-10').end, '2028-02-29');
eq('winter across century-ish wrap', Logic.defaultSeasonFor('2099-12-01').name, 'Winter 2099–00');

// --- season lookup ---
var seasons = [
  { name: 'Fall 2026', start: '2026-09-01', end: '2026-11-30' },
  { name: 'Road trip', start: '2026-11-20', end: '2026-11-27' },
  { name: 'Summer 2026', start: '2026-06-01', end: '2026-08-31' }
];
eq('seasonForDate plain', Logic.seasonForDate(seasons, '2026-10-01').name, 'Fall 2026');
eq('seasonForDate overlap prefers latest start', Logic.seasonForDate(seasons, '2026-11-23').name, 'Road trip');
eq('seasonForDate inclusive end', Logic.seasonForDate(seasons, '2026-08-31').name, 'Summer 2026');
eq('seasonForDate none', Logic.seasonForDate(seasons, '2026-12-01'), null);
eq('sortSeasons newest first', Logic.sortSeasons(seasons).map(function (s) { return s.name; }), ['Road trip', 'Fall 2026', 'Summer 2026']);
eq('daysIn capped at today', Logic.daysIn('2026-11-28', '2026-12-31', '2026-11-30'), ['2026-11-28', '2026-11-29', '2026-11-30']);
eq('daysIn full', Logic.daysIn('2026-02-27', '2026-03-01').length, 3);

// --- Spotify links ---
var pl = Logic.parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123');
eq('playlist link', pl, { type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M', web: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' });
eq('intl link', Logic.parseSpotifyUrl('https://open.spotify.com/intl-de/album/1A2B3c').type, 'album');
eq('uri', Logic.parseSpotifyUrl('spotify:playlist:XYZ').id, 'XYZ');
eq('whitespace trimmed', Logic.parseSpotifyUrl('  https://open.spotify.com/playlist/AbC  ').id, 'AbC');
eq('track link rejected', Logic.parseSpotifyUrl('https://open.spotify.com/track/abc'), null);
eq('junk rejected', Logic.parseSpotifyUrl('https://example.com/playlist/abc'), null);
eq('empty rejected', Logic.parseSpotifyUrl(''), null);

// --- Last.fm parsing ---
function lfTrack(name, artist, uts, nowPlaying) {
  var t = { name: name, artist: { '#text': artist }, album: { '#text': 'Alb' },
            image: [{ '#text': 'small.jpg', size: 'small' }, { '#text': 'big.jpg', size: 'extralarge' }] };
  if (uts) t.date = { uts: String(uts) };
  if (nowPlaying) t['@attr'] = { nowplaying: 'true' };
  return t;
}
var json = { recenttracks: { track: [lfTrack('Now', 'A', 0, true), lfTrack('Song B', 'Art', 1700000100), lfTrack('Song A', 'Art', 1700000000)],
                             '@attr': { totalPages: '3' } } };
var tracks = Logic.normalizeTracks(json);
eq('drops now playing', tracks.length, 2);
eq('track shape', tracks[1], { name: 'Song A', artist: 'Art', album: 'Alb', image: 'big.jpg', uts: 1700000000 });
eq('single object result', Logic.normalizeTracks({ recenttracks: { track: lfTrack('Solo', 'X', 1700000000) } }).length, 1);
eq('empty result', Logic.normalizeTracks({ recenttracks: { track: [] } }), []);
eq('error result', Logic.normalizeTracks({ error: 6, message: 'User not found' }), []);
eq('totalPages', Logic.totalPages(json), 3);
eq('totalPages missing', Logic.totalPages({}), 1);

// --- bucketing and ranking ---
var t0 = new Date(2026, 10, 23, 9, 0).getTime() / 1000;
var t1 = new Date(2026, 10, 23, 23, 59).getTime() / 1000;
var t2 = new Date(2026, 10, 24, 0, 1).getTime() / 1000;
var mk = function (n, a, uts) { return { name: n, artist: a, album: '', image: '', uts: uts }; };
var plays = [mk('B', 'Y', t1), mk('A', 'X', t0), mk('A', 'X', t2), mk('a', 'x', t2 + 60), mk('C', 'Y', t2 + 120)];
var buckets = Logic.bucketByDay(plays);
eq('buckets by local day', Object.keys(buckets).sort(), ['2026-11-23', '2026-11-24']);
eq('bucket sorted oldest first', buckets['2026-11-23'].map(function (t) { return t.name; }), ['A', 'B']);
eq('top tracks merges case', Logic.topTracks(plays, 2), [{ name: 'A', artist: 'X', image: '', plays: 3 }, { name: 'B', artist: 'Y', image: '', plays: 1 }]);
eq('top artists', Logic.topArtists(plays), [{ name: 'X', plays: 3 }, { name: 'Y', plays: 2 }]);

// --- entries & capsule ---
eq('empty entry', Logic.entryHasContent({ note: '   ', moments: [], photos: [] }), false);
eq('note entry', Logic.entryHasContent({ note: 'hi' }), true);
eq('photo entry', Logic.entryHasContent({ note: '', photos: [{}] }), true);
var season = { name: 'Fall 2026', start: '2026-11-22', end: '2026-11-30' };
var entries = {
  '2026-11-23': { note: 'great day', moments: [{ text: 'x' }], photos: [{}, {}] },
  '2026-11-24': { note: '', moments: [], photos: [] }
};
var st = Logic.capsuleStats(season, entries, buckets, '2026-11-24');
eq('capsule days capped at today', st.days, 3);
eq('capsule journaled', st.journaledDays, 1);
eq('capsule photos', st.photos, 2);
eq('capsule moments', st.moments, 1);
eq('capsule plays', st.plays, 5);
eq('capsule unique songs', st.uniqueSongs, 3);
eq('capsule busiest', st.busiestDay, { day: '2026-11-24', plays: 3 });
eq('capsule no plays -> no busiest', Logic.capsuleStats(season, {}, {}, '2026-11-24').busiestDay, null);

// --- on this day ---
eq('onThisDay', Logic.onThisDay('2026-11-23', ['2025-11-23', '2026-11-23', '2024-11-23', '2025-11-22', '2027-11-23', '2025-11-23']), ['2025-11-23', '2024-11-23']);
eq('yearsAgo', Logic.yearsAgo('2024-11-23', '2026-11-23'), '2 years ago');
eq('yearsAgo singular', Logic.yearsAgo('2025-11-23', '2026-11-23'), '1 year ago');
eq('uid unique', Logic.uid() !== Logic.uid(), true);

// --- recap ---
(function () {
  var at = function (key, h, m) { var d = Logic.parseKey(key); d.setHours(h, m || 0); return d.getTime() / 1000; };
  var t = function (n, a, key, h) { return { name: n, artist: a, album: '', image: '', uts: at(key, h) }; };
  var season = { id: 's', name: 'Fall 2026', start: '2026-09-01', end: '2026-11-30' };
  var plays = Logic.bucketByDay([
    t('Nights', 'Frank Ocean', '2026-09-02', 8),          // first song of season
    t('Ivy', 'Frank Ocean', '2026-09-05', 9),
    t('Ivy', 'Frank Ocean', '2026-09-05', 10),
    t('Kyoto', 'Phoebe Bridgers', '2026-10-10', 9),
    t('Kyoto', 'Phoebe Bridgers', '2026-10-10', 10),
    t('Ivy', 'Frank Ocean', '2026-10-10', 11),
    t('Garden Song', 'Phoebe Bridgers', '2026-11-29', 23)  // last song of season
  ]);
  var entries = {
    '2026-08-30': { note: 'before season', moments: [{ text: 'x', song: { name: 'A', artist: 'B' } }], photos: [{ id: 'p0' }] },
    '2026-09-05': { note: 'drove to the lake', moments: [{ id: 'm1', text: 'windows down', song: { name: 'Ivy', artist: 'Frank Ocean' } }, { id: 'm2', text: 'no song' }], photos: [{ id: 'p1' }] },
    '2026-10-10': { note: '  first frost  ', moments: [], photos: [{ id: 'p2' }, { id: 'p3' }] }
  };
  var r = Logic.recapData(season, entries, plays, '2026-12-02');
  eq('recap finished', r.finished, true);
  eq('recap top song', r.topSong, { name: 'Ivy', artist: 'Frank Ocean', image: '', plays: 3, firstDay: '2026-09-05' });
  eq('recap top artist', r.topArtist, { name: 'Frank Ocean', plays: 4 });
  eq('recap hours estimate', r.hours, 0);
  eq('recap loudest day', r.loudest.day, '2026-10-10');
  eq('recap loudest note trimmed', r.loudest.note, 'first frost');
  eq('recap loudest top tracks', r.loudest.topTracks.map(function (x) { return x.name; }), ['Kyoto', 'Ivy']);
  eq('recap song memories only in season, only with songs', r.songMemories, [{ day: '2026-09-05', song: { name: 'Ivy', artist: 'Frank Ocean' }, text: 'windows down' }]);
  eq('recap photos in season', r.photos.map(function (p) { return p.id; }), ['p1', 'p2', 'p3']);
  eq('recap first song', r.firstSong.name + ' ' + r.firstSong.day, 'Nights 2026-09-02');
  eq('recap last song', r.lastSong.name + ' ' + r.lastSong.day, 'Garden Song 2026-11-29');
  eq('recap not empty', r.isEmpty, false);

  var mid = Logic.recapData(season, entries, plays, '2026-10-10');
  eq('recap mid-season not finished', mid.finished, false);
  eq('recap mid-season ignores future plays', mid.lastSong.name, 'Ivy');

  var many = []; for (var i = 0; i < 120; i++) many.push(t('S' + (i % 5), 'A', '2026-09-10', 12));
  eq('recap hours rounds', Logic.recapData(season, {}, Logic.bucketByDay(many), '2026-12-01').hours, 7);

  var empty = Logic.recapData(season, {}, {}, '2026-12-01');
  eq('recap empty', [empty.isEmpty, empty.topSong, empty.loudest, empty.firstSong, empty.lastSong], [true, null, null, null, null]);
  var one = Logic.recapData(season, {}, Logic.bucketByDay([t('Only', 'One', '2026-09-03', 9)]), '2026-12-01');
  eq('recap single play has no separate last song', [one.firstSong.name, one.lastSong], ['Only', null]);

  var ss = [{ name: 'Summer', start: '2026-06-01', end: '2026-08-31' }, season, { name: 'Winter', start: '2026-12-01', end: '2027-02-28' }];
  eq('recently ended', Logic.recentlyEndedSeasons(ss, '2026-12-05', 30).map(function (s) { return s.name; }), ['Fall 2026']);
  eq('recently ended none on last day', Logic.recentlyEndedSeasons(ss, '2026-11-30', 30).map(function (s) { return s.name; }), []);
})();

log((fail ? 'RESULT: FAIL' : 'RESULT: PASS') + ' (' + pass + ' passed, ' + fail + ' failed)');
if (fail && typeof process !== 'undefined') process.exit(1);
