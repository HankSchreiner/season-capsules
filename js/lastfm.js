/**
 * Last.fm listening history. The user links Spotify -> Last.fm once
 * (Spotify Settings > Apps, or last.fm/settings/applications), and every song
 * they play anywhere gets logged with a timestamp. We read it back here.
 */
var LastFM = (function () {
  'use strict';
  var API = 'https://ws.audioscrobbler.com/2.0/';
  var MAX_PAGES = 150; // 150 x 200 = 30,000 plays per sync — plenty for one season

  function call(params) {
    var s = DB.getSettings();
    if (!s.lastfmUser || !s.lastfmKey) return Promise.reject(new Error('Connect Last.fm in Settings first.'));
    var q = 'method=user.getrecenttracks&format=json&limit=200&extended=0' +
            '&user=' + encodeURIComponent(s.lastfmUser) + '&api_key=' + encodeURIComponent(s.lastfmKey);
    for (var k in params) q += '&' + k + '=' + encodeURIComponent(params[k]);
    return fetch(API + '?' + q).then(function (r) {
      return r.json().catch(function () { throw new Error('Last.fm returned an unreadable response (HTTP ' + r.status + ').'); });
    }).then(function (json) {
      if (json.error) throw new Error('Last.fm: ' + json.message);
      return json;
    });
  }

  /** All plays between two unix-second timestamps, following pagination. */
  function playsBetween(from, to, onProgress) {
    var tracks = [];
    function page(n) {
      return call({ from: from, to: to, page: n }).then(function (json) {
        tracks = tracks.concat(Logic.normalizeTracks(json));
        var total = Math.min(Logic.totalPages(json), MAX_PAGES);
        if (onProgress) onProgress(n, total);
        return n < total ? page(n + 1) : tracks;
      });
    }
    return page(1);
  }

  /**
   * Fetch and cache plays for every day from startKey to endKey.
   * Returns {date: tracks} for that range.
   */
  function syncDays(startKey, endKey, onProgress) {
    var range = Logic.keyRange(startKey, endKey);
    return playsBetween(range.from, range.to, onProgress).then(function (tracks) {
      var byDay = Logic.bucketByDay(tracks);
      var days = Logic.daysIn(startKey, endKey);
      return DB.savePlays(days, byDay).then(function () { return byDay; });
    });
  }

  /** Check the username and key work. Resolves with the user's total play count. */
  function test() {
    return call({ page: 1 }).then(function (json) {
      var a = json.recenttracks && json.recenttracks['@attr'];
      return a ? +a.total : 0;
    });
  }

  return { syncDays: syncDays, test: test };
})();
