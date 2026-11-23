/**
 * Season Capsules — UI. Three tabs: Today, Capsule, Settings.
 * Plain DOM, no framework, no build step.
 */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var view = $('#view');
  var REFRESH_MS = 5 * 60 * 1000; // re-check Last.fm for today/yesterday at most every 5 min

  var state = {
    tab: 'today',
    day: today(),
    entry: null,
    pendingSong: null,     // song picked to pin to the next moment
    capsuleSeasonId: null,
    objectUrls: []
  };

  function today() { return Logic.dateKey(new Date()); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /** Object URLs for photo blobs; revoked whenever the view is rebuilt. */
  function blobUrl(blob) {
    var u = URL.createObjectURL(blob);
    state.objectUrls.push(u);
    return u;
  }
  function releaseUrls() {
    state.objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    state.objectUrls = [];
  }

  // ---------- seasons ----------

  function seasons() { return DB.getSeasons(); }

  function seasonById(id) {
    var s = seasons();
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return null;
  }

  function saveSeason(season) {
    var list = seasons(), found = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === season.id) { list[i] = season; found = true; }
    if (!found) list.push(season);
    DB.setSeasons(list);
  }

  function createDefaultSeason(dayKey) {
    var s = Logic.defaultSeasonFor(dayKey);
    s.id = Logic.uid();
    saveSeason(s);
    return s;
  }

  /** Header colour per season (like a playlist's cover colour) so each capsule feels different. */
  function accentFor(season) {
    var n = (season && season.name || '').toLowerCase();
    if (n.indexOf('fall') >= 0 || n.indexOf('autumn') >= 0) return '#b5562a';
    if (n.indexOf('winter') >= 0) return '#3b5f8f';
    if (n.indexOf('spring') >= 0) return '#2f7d56';
    if (n.indexOf('summer') >= 0) return '#a87b12';
    return '#5b3f8c';
  }

  function playButton(season, big) {
    var link = season && Logic.parseSpotifyUrl(season.playlistUrl);
    if (!link) return '';
    return '<a class="play' + (big ? ' big' : '') + '" href="' + esc(link.web) + '" target="_blank" rel="noopener">' +
           '<span class="tri"></span>Play ' + esc(season.name) + '</a>';
  }

  // ---------- navigation ----------

  function go(tab) {
    flushNote();
    state.tab = tab;
    document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    render();
  }

  function render() {
    releaseUrls();
    window.scrollTo(0, 0);
    if (state.tab === 'today') return renderToday();
    if (state.tab === 'capsule') return renderCapsule();
    return renderSettings();
  }

  // ---------- TODAY ----------

  function renderToday() {
    var day = state.day, isToday = day === today();
    var season = Logic.seasonForDate(seasons(), day);
    document.documentElement.style.setProperty('--season', accentFor(season));
    state.pendingSong = null;

    var seasonHtml;
    if (season) {
      var link = Logic.parseSpotifyUrl(season.playlistUrl);
      seasonHtml =
        '<section class="season">' +
          '<div class="season-name">' + esc(season.name) + '</div>' +
          '<div class="muted">' + esc(Logic.prettyDay(season.start, true)) + ' – ' + esc(Logic.prettyDay(season.end, true)) + '</div>' +
          (link ? playButton(season, true)
                : '<div class="add-link"><input id="pl-url" placeholder="Paste your Spotify playlist link" inputmode="url">' +
                  '<button id="pl-save">Save</button></div>') +
        '</section>';
    } else {
      var def = Logic.defaultSeasonFor(day);
      seasonHtml =
        '<section class="season empty">' +
          '<div>No season covers this day yet.</div>' +
          '<button id="start-season">Start ' + esc(def.name) + '</button>' +
        '</section>';
    }

    view.innerHTML =
      '<div class="day-nav">' +
        '<button id="prev" aria-label="Previous day">‹</button>' +
        '<label class="day-label">' + esc(Logic.prettyDay(day, !isToday && day.slice(0, 4) !== today().slice(0, 4))) +
          (isToday ? ' <span class="pill">Today</span>' : '') +
          '<input type="date" id="pick-day" value="' + day + '" max="' + today() + '"></label>' +
        '<button id="next" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>›</button>' +
      '</div>' +
      seasonHtml +
      '<section class="card">' +
        '<h2>' + (isToday ? 'Today' : 'This day') + ' <span id="saved" class="muted small"></span></h2>' +
        '<textarea id="note" rows="4" placeholder="What happened? Where were you, who were you with, how did it feel?"></textarea>' +
      '</section>' +
      '<section class="card">' +
        '<h2>Memories</h2>' +
        '<div id="moments"></div>' +
        '<div id="pin-chip"></div>' +
        '<form id="moment-form" class="row"><input id="moment-text" placeholder="Add a memory…" autocomplete="off"><button>Add</button></form>' +
      '</section>' +
      '<section class="card">' +
        '<h2>Photos</h2>' +
        '<div id="photos" class="photo-grid"></div>' +
        '<label class="button ghost">+ Add photos<input type="file" id="photo-input" accept="image/*" multiple hidden></label>' +
      '</section>' +
      '<section class="card">' +
        '<h2>Songs ' + (isToday ? 'today' : 'this day') + ' <button id="refresh-songs" class="link small">Refresh</button></h2>' +
        '<div id="songs" class="muted">Loading…</div>' +
      '</section>' +
      '<section class="card" id="otd-card" hidden><h2>On this day</h2><div id="otd"></div></section>';

    bindToday(season);

    DB.getEntry(day).then(function (e) {
      if (state.day !== day || state.tab !== 'today') return;
      state.entry = e;
      state.noteDirty = false;
      $('#note').value = e.note || '';
      renderMoments();
      renderPhotos();
    });
    loadSongs(day, false);
    loadOnThisDay(day);
  }

  function bindToday(season) {
    $('#prev').onclick = function () { changeDay(Logic.addDays(state.day, -1)); };
    $('#next').onclick = function () { if (state.day < today()) changeDay(Logic.addDays(state.day, 1)); };
    $('#pick-day').onchange = function (e) { if (e.target.value) changeDay(e.target.value > today() ? today() : e.target.value); };

    if ($('#start-season')) $('#start-season').onclick = function () { createDefaultSeason(state.day); renderToday(); };
    if ($('#pl-save')) $('#pl-save').onclick = function () {
      var url = $('#pl-url').value;
      if (!Logic.parseSpotifyUrl(url)) return toast('That doesn’t look like a Spotify playlist or album link.');
      season.playlistUrl = url.trim();
      saveSeason(season);
      renderToday();
    };

    $('#note').oninput = function () {
      if (!state.entry) return;
      state.entry.note = this.value;
      state.noteDirty = true;
      $('#saved').textContent = '';
      clearTimeout(state._noteTimer);
      state._noteTimer = setTimeout(flushNote, 500);
    };

    $('#moment-form').onsubmit = function (ev) {
      ev.preventDefault();
      var input = $('#moment-text'), text = input.value.trim();
      if (!state.entry || (!text && !state.pendingSong)) return;
      var m = { id: Logic.uid(), text: text, createdAt: Date.now() };
      if (state.pendingSong) m.song = { name: state.pendingSong.name, artist: state.pendingSong.artist, image: state.pendingSong.image, uts: state.pendingSong.uts };
      state.entry.moments.push(m);
      input.value = '';
      state.pendingSong = null;
      renderPinChip();
      persist().then(renderMoments);
    };

    $('#photo-input').onchange = function (ev) {
      // Copy the file list BEFORE clearing the input: clearing it empties the live list.
      var files = Array.prototype.slice.call(ev.target.files || []);
      ev.target.value = '';
      if (!files.length || !state.entry) return;
      toast('Adding ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '…');
      Promise.all(files.map(shrinkPhoto)).then(function (blobs) {
        blobs.forEach(function (b) { state.entry.photos.push({ id: Logic.uid(), blob: b, caption: '' }); });
        return persist();
      }).then(renderPhotos).catch(function (err) { toast('Couldn’t add photo: ' + err.message); });
    };

    $('#refresh-songs').onclick = function () { loadSongs(state.day, true); };
  }

  function changeDay(key) {
    flushNote();
    state.day = key;
    renderToday();
  }

  function persist() {
    var e = state.entry;
    return DB.saveEntry(e).then(function () {
      if (state.entry === e && $('#saved')) $('#saved').textContent = 'Saved';
    }).catch(function (err) { toast('Save failed: ' + err.message); });
  }

  function flushNote() {
    clearTimeout(state._noteTimer);
    var el = $('#note');
    if (state.noteDirty && state.tab === 'today' && el && state.entry && state.entry.date === state.day) {
      state.noteDirty = false;
      state.entry.note = el.value;
      return persist();
    }
  }

  function renderMoments() {
    var box = $('#moments');
    if (!box || !state.entry) return;
    var ms = state.entry.moments;
    if (!ms.length) { box.innerHTML = '<p class="muted small">Little things worth remembering. Tap ★ on a song below to tie a memory to it.</p>'; return; }
    box.innerHTML = ms.map(function (m) {
      return '<div class="moment">' +
        (m.song ? songChip(m.song) : '') +
        (m.text ? '<div>' + esc(m.text) + '</div>' : '') +
        '<button class="x" data-id="' + esc(m.id) + '" aria-label="Delete memory">×</button></div>';
    }).join('');
    box.querySelectorAll('.x').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Delete this memory?')) return;
        state.entry.moments = state.entry.moments.filter(function (m) { return m.id !== b.dataset.id; });
        persist().then(renderMoments);
      };
    });
  }

  function songChip(song) {
    return '<div class="song-chip">' + (song.image ? '<img src="' + esc(song.image) + '" alt="">' : '<span class="note-ico">♪</span>') +
           '<span><b>' + esc(song.name) + '</b> · ' + esc(song.artist) + '</span></div>';
  }

  function renderPinChip() {
    var box = $('#pin-chip');
    if (!box) return;
    if (!state.pendingSong) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="pinning">Tying memory to ' + songChip(state.pendingSong) + '<button class="x" id="unpin">×</button></div>';
    $('#unpin').onclick = function () { state.pendingSong = null; renderPinChip(); };
  }

  function renderPhotos() {
    var box = $('#photos');
    if (!box || !state.entry) return;
    box.innerHTML = state.entry.photos.map(function (p) {
      return '<figure><img src="' + blobUrl(p.blob) + '" alt=""><button class="x" data-id="' + esc(p.id) + '" aria-label="Delete photo">×</button></figure>';
    }).join('');
    box.querySelectorAll('.x').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Delete this photo?')) return;
        state.entry.photos = state.entry.photos.filter(function (p) { return p.id !== b.dataset.id; });
        persist().then(renderPhotos);
      };
    });
  }

  /** Downscale a photo to max 1600px JPEG so storage stays reasonable. */
  function shrinkPhoto(file) {
    var MAX = 1600;
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('could not encode image')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unsupported image type')); };
      img.src = url;
    });
  }

  function connected() { var s = DB.getSettings(); return !!(s.lastfmUser && s.lastfmKey); }

  function loadSongs(day, force) {
    var box = $('#songs');
    if (!connected()) {
      box.innerHTML = 'Connect Last.fm in <a href="#" id="to-settings">Settings</a> to see what you played each day.';
      $('#to-settings').onclick = function (e) { e.preventDefault(); go('settings'); };
      return;
    }
    DB.getPlays(day).then(function (cached) {
      var recent = day >= Logic.addDays(today(), -1);
      var stale = !cached || (recent && Date.now() - cached.fetchedAt > REFRESH_MS);
      if (cached) showSongs(day, cached.tracks);
      if (!force && !stale) return;
      if (!cached) box.textContent = 'Loading from Last.fm…';
      return LastFM.syncDays(day, day).then(function (byDay) { showSongs(day, byDay[day] || []); });
    }).catch(function (err) {
      if (state.day === day && $('#songs')) $('#songs').textContent = err.message;
    });
  }

  function showSongs(day, tracks) {
    var box = $('#songs');
    if (!box || state.day !== day || state.tab !== 'today') return;
    if (!tracks.length) { box.innerHTML = 'No plays logged ' + (day === today() ? 'yet today.' : 'this day.'); return; }
    // Newest first, each play listed (repeats show how many times).
    var top = Logic.topTracks(tracks);
    var counts = {};
    top.forEach(function (t) { counts[(t.artist + '|' + t.name).toLowerCase()] = t.plays; });
    var seen = {}, rows = [];
    tracks.slice().reverse().forEach(function (t) {
      var k = (t.artist + '|' + t.name).toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      rows.push(t);
    });
    box.classList.remove('muted');
    box.innerHTML = '<div class="muted small">' + tracks.length + (tracks.length === 1 ? ' play' : ' plays') + ' · ' +
      rows.length + (rows.length === 1 ? ' song' : ' songs') + '</div>' +
      rows.map(function (t, i) {
        var time = new Date(t.uts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        var n = counts[(t.artist + '|' + t.name).toLowerCase()];
        return '<div class="song">' +
          (t.image ? '<img src="' + esc(t.image) + '" alt="" loading="lazy">' : '<span class="art-ph">♪</span>') +
          '<div class="song-text"><b>' + esc(t.name) + '</b><span>' + esc(t.artist) + (n > 1 ? ' · ' + n + '×' : '') + '</span></div>' +
          '<span class="muted small">' + esc(time) + '</span>' +
          '<button class="pin" data-i="' + i + '" title="Tie a memory to this song">★</button></div>';
      }).join('');
    box.querySelectorAll('.pin').forEach(function (b) {
      b.onclick = function () {
        state.pendingSong = rows[+b.dataset.i];
        renderPinChip();
        $('#moment-text').focus();
      };
    });
  }

  function loadOnThisDay(day) {
    Promise.all([DB.entryKeys(), DB.playKeys()]).then(function (r) {
      var past = Logic.onThisDay(day, r[0].concat(r[1]));
      if (!past.length) return;
      return Promise.all(past.map(function (k) {
        return Promise.all([DB.getEntry(k), DB.getPlays(k)]).then(function (x) { return { day: k, entry: x[0], plays: x[1] ? x[1].tracks : [] }; });
      })).then(function (items) {
        items = items.filter(function (it) { return Logic.entryHasContent(it.entry) || it.plays.length; });
        if (!items.length || state.day !== day || !$('#otd')) return;
        $('#otd-card').hidden = false;
        $('#otd').innerHTML = items.map(function (it) {
          var s = Logic.seasonForDate(seasons(), it.day);
          var top = Logic.topTracks(it.plays, 1)[0];
          var photo = it.entry.photos && it.entry.photos[0];
          return '<button class="otd" data-day="' + it.day + '">' +
            (photo ? '<img src="' + blobUrl(photo.blob) + '" alt="">' : '') +
            '<div><div class="small muted">' + esc(Logic.yearsAgo(it.day, day)) + (s ? ' · ' + esc(s.name) : '') + '</div>' +
            (it.entry.note ? '<div class="clip">' + esc(it.entry.note) + '</div>' : '') +
            (top ? '<div class="small">♪ ' + esc(top.name) + ' – ' + esc(top.artist) + '</div>' : '') +
            '</div></button>';
        }).join('');
        $('#otd').querySelectorAll('.otd').forEach(function (b) { b.onclick = function () { changeDay(b.dataset.day); }; });
      });
    });
  }

  // ---------- CAPSULE ----------

  function renderCapsule() {
    var list = Logic.sortSeasons(seasons());
    if (!list.length) { view.innerHTML = '<section class="card">No seasons yet. Add one in Settings.</section>'; return; }
    var current = Logic.seasonForDate(list, today());
    var season = seasonById(state.capsuleSeasonId) || current || list[0];
    state.capsuleSeasonId = season.id;
    document.documentElement.style.setProperty('--season', accentFor(season));

    view.innerHTML =
      '<div class="row"><select id="season-pick">' + list.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (s.id === season.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('') + '</select></div>' +
      '<section class="season">' +
        '<div class="season-name">' + esc(season.name) + '</div>' +
        '<div class="muted">' + esc(Logic.prettyDay(season.start, true)) + ' – ' + esc(Logic.prettyDay(season.end, true)) + '</div>' +
        playButton(season, false) +
        (connected() ? '<button id="sync" class="ghost">Sync listening for this season</button><div id="sync-status" class="small muted"></div>' : '') +
      '</section>' +
      '<div id="capsule-body" class="muted">Building capsule…</div>';

    $('#season-pick').onchange = function () { state.capsuleSeasonId = this.value; renderCapsule(); };
    if ($('#sync')) $('#sync').onclick = function () {
      var btn = this, end = season.end < today() ? season.end : today();
      btn.disabled = true;
      LastFM.syncDays(season.start, end, function (n, total) {
        $('#sync-status').textContent = 'Fetching page ' + n + ' of ' + total + '…';
      }).then(function () {
        toast('Listening history synced.');
        renderCapsule();
      }).catch(function (err) {
        btn.disabled = false;
        $('#sync-status').textContent = err.message;
      });
    };

    Promise.all([DB.entriesBetween(season.start, season.end), DB.playsBetween(season.start, season.end)]).then(function (r) {
      if (state.tab !== 'capsule' || state.capsuleSeasonId !== season.id) return;
      drawCapsule(season, r[0], r[1]);
    });
  }

  function drawCapsule(season, entries, playsByDay) {
    var st = Logic.capsuleStats(season, entries, playsByDay, today());
    var body = $('#capsule-body');
    body.classList.remove('muted');

    var tiles =
      '<div class="tiles">' +
        tile(st.journaledDays + '<small>/' + st.days + '</small>', 'days journaled') +
        tile(st.plays.toLocaleString(), 'plays') +
        tile(st.uniqueSongs.toLocaleString(), 'songs') +
        tile(st.moments, 'memories') +
        tile(st.photos, 'photos') +
        tile(st.busiestDay ? esc(Logic.prettyDay(st.busiestDay.day).slice(5)) : '—', st.busiestDay ? 'loudest day (' + st.busiestDay.plays + ' plays)' : 'loudest day') +
      '</div>';

    var topSongs = st.topTracks.length
      ? '<section class="card"><h2>The soundtrack</h2><ol class="top">' + st.topTracks.map(function (t) {
          return '<li>' + (t.image ? '<img src="' + esc(t.image) + '" alt="" loading="lazy">' : '<span class="art-ph">♪</span>') +
            '<div class="song-text"><b>' + esc(t.name) + '</b><span>' + esc(t.artist) + '</span></div><span class="muted small">' + t.plays + '×</span></li>';
        }).join('') + '</ol></section>'
      : '<section class="card muted">' + (connected() ? 'No listening synced for this season yet. Tap “Sync listening” above.' : 'Connect Last.fm in Settings to see this season’s soundtrack.') + '</section>';

    var topArtists = st.topArtists.length
      ? '<section class="card"><h2>On repeat</h2><div class="artists">' + st.topArtists.map(function (a) {
          return '<span class="pill">' + esc(a.name) + ' <small>' + a.plays + '</small></span>';
        }).join('') + '</div></section>'
      : '';

    var days = Object.keys(entries).sort();
    var journal = days.length
      ? '<section class="card"><h2>The story</h2>' + days.map(function (k) {
          var e = entries[k];
          return '<article class="jday">' +
            '<button class="link jdate" data-day="' + k + '">' + esc(Logic.prettyDay(k)) + '</button>' +
            (e.note ? '<p>' + esc(e.note).replace(/\n/g, '<br>') + '</p>' : '') +
            (e.moments || []).map(function (m) { return '<div class="moment">' + (m.song ? songChip(m.song) : '') + (m.text ? '<div>' + esc(m.text) + '</div>' : '') + '</div>'; }).join('') +
            ((e.photos || []).length ? '<div class="photo-grid">' + e.photos.map(function (p) { return '<figure><img src="' + blobUrl(p.blob) + '" alt=""></figure>'; }).join('') + '</div>' : '') +
            '</article>';
        }).join('') + '</section>'
      : '<section class="card muted">No journal entries in this season yet.</section>';

    body.innerHTML = tiles + topSongs + topArtists + journal;
    body.querySelectorAll('.jdate').forEach(function (b) {
      b.onclick = function () { state.day = b.dataset.day; go('today'); };
    });
  }

  function tile(big, label) { return '<div class="tile"><div class="big">' + big + '</div><div class="small muted">' + label + '</div></div>'; }

  // ---------- SETTINGS ----------

  function renderSettings() {
    document.documentElement.style.setProperty('--season', accentFor(Logic.seasonForDate(seasons(), today())));
    var s = DB.getSettings();
    var list = Logic.sortSeasons(seasons());

    view.innerHTML =
      '<section class="card"><h2>Seasons</h2>' +
        '<p class="muted small">Each season gets its own playlist. Dates can be anything: a semester, a summer job, a trip.</p>' +
        list.map(seasonForm).join('') +
        '<button id="add-season" class="ghost">+ New season</button>' +
      '</section>' +
      '<section class="card"><h2>Listening history (Last.fm)</h2>' +
        '<ol class="steps small">' +
          '<li>Make a free account at <a href="https://www.last.fm/join" target="_blank" rel="noopener">last.fm</a>.</li>' +
          '<li>Connect Spotify to it: <a href="https://www.last.fm/settings/applications" target="_blank" rel="noopener">last.fm → Settings → Applications → Spotify</a>. From then on every song you play is logged.</li>' +
          '<li>Get an API key (free, instant): <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">create an API account</a>. Any app name works.</li>' +
        '</ol>' +
        '<label>Last.fm username<input id="lf-user" value="' + esc(s.lastfmUser) + '" autocapitalize="off" autocomplete="off"></label>' +
        '<label>API key<input id="lf-key" value="' + esc(s.lastfmKey) + '" autocapitalize="off" autocomplete="off"></label>' +
        '<div class="row"><button id="lf-save">Save & test</button><span id="lf-status" class="small muted"></span></div>' +
        '<p class="muted small">Last.fm only logs plays from the moment you connect it, so start now: today’s songs become next year’s memories.</p>' +
      '</section>' +
      '<section class="card"><h2>Backup</h2>' +
        '<p class="muted small">Everything is stored only on this device. Export a backup now and then.</p>' +
        '<div class="row"><button id="export" class="ghost">Export backup</button>' +
        '<label class="button ghost">Import backup<input type="file" id="import" accept="application/json,.json" hidden></label></div>' +
      '</section>';

    view.querySelectorAll('form.season-form').forEach(bindSeasonForm);

    $('#add-season').onclick = function () {
      var all = seasons(), cur = Logic.seasonForDate(all, today());
      var basis = cur ? Logic.addDays(Logic.sortSeasons(all)[0].end, 1) : today();
      var ns = Logic.defaultSeasonFor(basis);
      ns.id = Logic.uid();
      saveSeason(ns);
      renderSettings();
      toast('Added ' + ns.name + '. Edit the name and dates as you like.');
    };

    $('#lf-save').onclick = function () {
      DB.setSettings({ lastfmUser: $('#lf-user').value.trim(), lastfmKey: $('#lf-key').value.trim() });
      DB.clearPlays(); // a different account means cached plays are wrong
      $('#lf-status').textContent = 'Testing…';
      LastFM.test().then(function (total) {
        $('#lf-status').textContent = '✓ Connected — ' + total.toLocaleString() + ' plays logged so far.';
      }).catch(function (err) { $('#lf-status').textContent = err.message; });
    };

    $('#export').onclick = function () {
      toast('Preparing backup…');
      DB.exportAll().then(function (data) {
        var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'season-capsules-backup-' + today() + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }).catch(function (err) { toast('Export failed: ' + err.message); });
    };

    $('#import').onchange = function (ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      file.text().then(JSON.parse).then(DB.importAll).then(function (n) {
        toast('Restored ' + n + ' days.');
        renderSettings();
      }).catch(function (err) { toast('Import failed: ' + err.message); });
    };
  }

  function seasonForm(s) {
    return '<form class="season-form" data-id="' + esc(s.id) + '">' +
      '<input name="name" value="' + esc(s.name) + '" placeholder="Season name" required>' +
      '<div class="row"><input type="date" name="start" value="' + esc(s.start) + '" required>' +
      '<span class="muted">to</span><input type="date" name="end" value="' + esc(s.end) + '" required></div>' +
      '<input name="playlistUrl" value="' + esc(s.playlistUrl) + '" placeholder="Spotify playlist link" inputmode="url">' +
      '<div class="row"><button>Save</button><button type="button" class="link danger del">Delete</button></div>' +
    '</form>';
  }

  function bindSeasonForm(form) {
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var s = { id: form.dataset.id, name: f.name.value.trim(), start: f.start.value, end: f.end.value, playlistUrl: f.playlistUrl.value.trim() };
      if (!s.name) return toast('Give the season a name.');
      if (s.end < s.start) return toast('The season ends before it starts.');
      if (s.playlistUrl && !Logic.parseSpotifyUrl(s.playlistUrl)) return toast('That doesn’t look like a Spotify playlist or album link.');
      saveSeason(s);
      toast('Saved ' + s.name + '.');
    };
    form.querySelector('.del').onclick = function () {
      if (!confirm('Delete this season? Your journal entries and photos are kept.')) return;
      DB.setSeasons(seasons().filter(function (s) { return s.id !== form.dataset.id; }));
      renderSettings();
    };
  }

  // ---------- boot ----------

  document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { go(b.dataset.tab); }; });

  // Save the note if the app is backgrounded mid-typing.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushNote();
    // Coming back to the app on a new day: jump to the new day.
    else if (state.tab === 'today' && state.day < today() && state._lastSeenToday === state.day) { state.day = today(); renderToday(); }
    if (!document.hidden) state._lastSeenToday = today();
  });
  window.addEventListener('pagehide', flushNote);
  state._lastSeenToday = today();

  if (!seasons().length) createDefaultSeason(today());
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
  }
})();
