/**
 * Local storage for Season Capsules. Everything lives on this device.
 *
 *   IndexedDB "season-capsules"
 *     entries  keyPath "date"  {date, note, moments:[{id,text,song?,createdAt}], photos:[{id,blob,caption}], updatedAt}
 *     plays    keyPath "date"  {date, tracks:[...], fetchedAt}
 *   localStorage
 *     sc.seasons   [{id, name, start, end, playlistUrl}]
 *     sc.settings  {lastfmUser, lastfmKey}
 */
var DB = (function () {
  'use strict';
  var NAME = 'season-capsules', VERSION = 1, dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('plays')) db.createObjectStore('plays', { keyPath: 'date' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode), s = t.objectStore(store), result;
        var r = fn(s);
        if (r) r.onsuccess = function () { result = r.result; };
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function get(store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); }
  function put(store, val) { return tx(store, 'readwrite', function (s) { return s.put(val); }); }
  function del(store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); }
  function all(store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); }
  function keys(store) { return tx(store, 'readonly', function (s) { return s.getAllKeys(); }); }
  function clear(store) { return tx(store, 'readwrite', function (s) { return s.clear(); }); }

  function emptyEntry(date) { return { date: date, note: '', moments: [], photos: [], updatedAt: 0 }; }

  function getEntry(date) {
    return get('entries', date).then(function (e) { return e || emptyEntry(date); });
  }

  function saveEntry(e) {
    e.updatedAt = Date.now();
    // Don't keep empty rows around.
    if (!Logic.entryHasContent(e)) return del('entries', e.date);
    return put('entries', e);
  }

  /** Entries in [start, end] as {date: entry}. */
  function entriesBetween(start, end) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = {}, t = db.transaction('entries', 'readonly');
        var req = t.objectStore('entries').openCursor(IDBKeyRange.bound(start, end));
        req.onsuccess = function () {
          var c = req.result;
          if (c) { out[c.key] = c.value; c.continue(); }
        };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function playsBetween(start, end) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = {}, t = db.transaction('plays', 'readonly');
        var req = t.objectStore('plays').openCursor(IDBKeyRange.bound(start, end));
        req.onsuccess = function () {
          var c = req.result;
          if (c) { out[c.key] = c.value.tracks; c.continue(); }
        };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  /** Save fetched plays. `byDay` is {date: tracks}; `days` lists every day covered (so empty days are cached too). */
  function savePlays(days, byDay) {
    var now = Date.now();
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('plays', 'readwrite'), s = t.objectStore('plays');
        days.forEach(function (d) { s.put({ date: d, tracks: byDay[d] || [], fetchedAt: now }); });
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  // --- localStorage ---
  function readJSON(k, fallback) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function getSeasons() { return readJSON('sc.seasons', []); }
  function setSeasons(s) { writeJSON('sc.seasons', s); }
  function getSettings() { return readJSON('sc.settings', { lastfmUser: '', lastfmKey: '' }); }
  function setSettings(s) { writeJSON('sc.settings', s); }

  // --- backup ---
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(url) { return fetch(url).then(function (r) { return r.blob(); }); }

  /** Full backup as a JSON-able object (photos inlined as data URLs). */
  function exportAll() {
    return all('entries').then(function (entries) {
      return Promise.all(entries.map(function (e) {
        return Promise.all((e.photos || []).map(function (p) {
          return blobToDataUrl(p.blob).then(function (d) { return { id: p.id, caption: p.caption || '', data: d }; });
        })).then(function (photos) {
          var copy = JSON.parse(JSON.stringify({ date: e.date, note: e.note, moments: e.moments, updatedAt: e.updatedAt }));
          copy.photos = photos;
          return copy;
        });
      }));
    }).then(function (entries) {
      return { app: 'season-capsules', version: 1, exportedAt: new Date().toISOString(),
               seasons: getSeasons(), entries: entries };
    });
  }

  /** Restore a backup. Merges: seasons by id, entries replace same-date entries. Settings are not touched. */
  function importAll(data) {
    if (!data || data.app !== 'season-capsules') return Promise.reject(new Error('Not a Season Capsules backup file.'));
    var seasons = getSeasons(), byId = {};
    seasons.forEach(function (s) { byId[s.id] = s; });
    (data.seasons || []).forEach(function (s) { byId[s.id] = s; });
    setSeasons(Object.keys(byId).map(function (k) { return byId[k]; }));
    return Promise.all((data.entries || []).map(function (e) {
      return Promise.all((e.photos || []).map(function (p) {
        return dataUrlToBlob(p.data).then(function (b) { return { id: p.id, caption: p.caption || '', blob: b }; });
      })).then(function (photos) {
        return put('entries', { date: e.date, note: e.note || '', moments: e.moments || [], photos: photos, updatedAt: e.updatedAt || Date.now() });
      });
    })).then(function () { return (data.entries || []).length; });
  }

  return {
    getEntry: getEntry, saveEntry: saveEntry, entriesBetween: entriesBetween, entryKeys: function () { return keys('entries'); },
    getPlays: function (d) { return get('plays', d); }, playsBetween: playsBetween, savePlays: savePlays,
    playKeys: function () { return keys('plays'); }, clearPlays: function () { return clear('plays'); },
    getSeasons: getSeasons, setSeasons: setSeasons, getSettings: getSettings, setSettings: setSettings,
    exportAll: exportAll, importAll: importAll
  };
})();
