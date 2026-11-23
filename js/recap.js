/**
 * End-of-season recap: full-screen story slides you tap through, ending in a
 * shareable image. Data comes from Logic.recapData; this file is only UI.
 */
var Recap = (function () {
  'use strict';

  var urls = [];
  var state = null; // {slides, i, data, entries, onClose}

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function blobUrl(b) { var u = URL.createObjectURL(b); urls.push(u); return u; }
  function plural(n, one, many) { return n.toLocaleString() + ' ' + (n === 1 ? one : (many || one + 's')); }
  function day(k) { return Logic.prettyDay(k).slice(5); }            // "Nov 23"
  function dayLong(k) { return Logic.prettyDay(k); }                 // "Mon, Nov 23"

  function art(t, cls) {
    return t && t.image ? '<img class="' + (cls || 'r-art') + '" src="' + esc(t.image) + '" alt="">'
                        : '<div class="' + (cls || 'r-art') + ' r-art-ph">♪</div>';
  }

  /** Find the stored photo blob for a {day, id} reference. */
  function photoBlob(entries, ref) {
    var e = entries[ref.day];
    if (!e) return null;
    for (var i = 0; i < e.photos.length; i++) if (e.photos[i].id === ref.id) return e.photos[i].blob;
    return null;
  }

  // ---------- slides ----------

  function buildSlides(d, entries) {
    var s = d.season, st = d.stats, slides = [];
    var c = s.color;

    slides.push({ bg: 'linear-gradient(160deg,' + c + ' 0%, #121212 85%)', html:
      '<div class="r-kicker a1">' + (d.finished ? 'Your season, wrapped up' : 'Your season so far') + '</div>' +
      '<div class="r-huge a2">' + esc(s.name) + '</div>' +
      '<div class="r-sub a3">' + esc(Logic.prettyDay(s.start, true)) + ' – ' + esc(Logic.prettyDay(s.end, true)) + '</div>' +
      '<div class="r-chips a4">' +
        (st.plays ? '<span>' + plural(st.plays, 'play') + '</span>' : '') +
        (st.journaledDays ? '<span>' + plural(st.journaledDays, 'day') + ' written</span>' : '') +
        (st.photos ? '<span>' + plural(st.photos, 'photo') + '</span>' : '') +
      '</div>' +
      '<div class="r-hint a5">Tap to continue</div>' });

    if (d.topSong) {
      var t = d.topSong;
      slides.push({ bg: 'linear-gradient(180deg, #1ed760 0%, #0f6e33 55%, #121212 100%)', dark: true, html:
        '<div class="r-kicker a1">Your song of the season</div>' +
        '<div class="a2">' + art(t, 'r-art r-art-big') + '</div>' +
        '<div class="r-title a3">' + esc(t.name) + '</div>' +
        '<div class="r-sub a3">' + esc(t.artist) + '</div>' +
        '<div class="r-stat a4">' + plural(t.plays, 'play') + '</div>' +
        (t.firstDay ? '<div class="r-sub a5">It first showed up on ' + esc(dayLong(t.firstDay)) + '.</div>' : '') });
    }

    if (st.topTracks.length > 1) {
      slides.push({ bg: 'linear-gradient(170deg, #2a2a2a 0%, #121212 70%)', html:
        '<div class="r-kicker a1">The soundtrack</div>' +
        '<ol class="r-list">' + st.topTracks.slice(0, 5).map(function (x, i) {
          return '<li class="a' + (i + 2) + '"><span class="r-num">' + (i + 1) + '</span>' + art(x) +
            '<div class="r-lt"><b>' + esc(x.name) + '</b><span>' + esc(x.artist) + '</span></div>' +
            '<span class="r-plays">' + x.plays + '</span></li>';
        }).join('') + '</ol>' });
    }

    if (d.topArtist) {
      var others = st.topArtists.slice(1, 5);
      slides.push({ bg: 'linear-gradient(200deg,' + c + ' 0%, #121212 80%)', html:
        '<div class="r-kicker a1">You spent about</div>' +
        '<div class="r-huge a2">' + plural(Math.max(d.hours, 1), 'hour') + '</div>' +
        '<div class="r-sub a3">with your music this season.</div>' +
        '<div class="r-kicker a4" style="margin-top:36px">On repeat the most</div>' +
        '<div class="r-title a4">' + esc(d.topArtist.name) + '</div>' +
        '<div class="r-sub a4">' + plural(d.topArtist.plays, 'play') + '</div>' +
        (others.length ? '<div class="r-chips a5">' + others.map(function (a) { return '<span>' + esc(a.name) + '</span>'; }).join('') + '</div>' : '') });
    }

    if (d.loudest) {
      var L = d.loudest;
      slides.push({ bg: 'linear-gradient(180deg, #3b2a5e 0%, #121212 75%)', html:
        '<div class="r-kicker a1">Your loudest day</div>' +
        '<div class="r-huge a2">' + esc(day(L.day)) + '</div>' +
        '<div class="r-sub a2">' + plural(L.plays, 'play') + ' in one day</div>' +
        (L.note ? '<blockquote class="r-quote a3">“' + esc(L.note.length > 180 ? L.note.slice(0, 177) + '…' : L.note) + '”</blockquote>'
                : '<div class="r-sub r-gap a3">You didn’t write anything that day. What was going on?</div>') +
        '<div class="r-mini a4">' + L.topTracks.map(function (x) { return '<div>♪ ' + esc(x.name) + ' <span>– ' + esc(x.artist) + '</span></div>'; }).join('') + '</div>' });
    }

    if (d.songMemories.length) {
      slides.push({ bg: 'linear-gradient(170deg,' + c + ' 0%, #121212 70%)', html:
        '<div class="r-kicker a1">The songs that mean something</div>' +
        '<div class="r-memories">' + d.songMemories.slice(-4).map(function (m, i) {
          return '<div class="r-memory a' + (i + 2) + '">' + art(m.song, 'r-art r-art-sm') +
            '<div><div class="r-mt"><b>' + esc(m.song.name) + '</b> · ' + esc(m.song.artist) + '</div>' +
            (m.text ? '<div>' + esc(m.text) + '</div>' : '') +
            '<div class="r-md">' + esc(day(m.day)) + '</div></div></div>';
        }).join('') + '</div>' });
    }

    if (d.photos.length) {
      var pics = pickSpread(d.photos, 9).map(function (ref) { return photoBlob(entries, ref); }).filter(Boolean);
      if (pics.length) slides.push({ bg: '#121212', html:
        '<div class="r-kicker a1">The season in pictures</div>' +
        '<div class="r-collage n' + Math.min(pics.length, 9) + '">' + pics.map(function (b, i) {
          return '<img class="a' + Math.min(i + 2, 6) + '" src="' + blobUrl(b) + '" alt="">';
        }).join('') + '</div>' });
    }

    if (d.firstSong && d.lastSong) {
      slides.push({ bg: 'linear-gradient(180deg, #121212 0%,' + c + ' 140%)', html:
        '<div class="r-kicker a1">Where it started</div>' +
        '<div class="r-book a2">' + art(d.firstSong) + '<div><b>' + esc(d.firstSong.name) + '</b><span>' + esc(d.firstSong.artist) + ' · ' + esc(day(d.firstSong.day)) + '</span></div></div>' +
        '<div class="r-line a3"></div>' +
        '<div class="r-kicker a4">' + (d.finished ? 'Where it ended' : 'Where you are now') + '</div>' +
        '<div class="r-book a5">' + art(d.lastSong) + '<div><b>' + esc(d.lastSong.name) + '</b><span>' + esc(d.lastSong.artist) + ' · ' + esc(day(d.lastSong.day)) + '</span></div></div>' });
    }

    slides.push({ bg: 'linear-gradient(160deg,' + c + ' 0%, #121212 80%)', final: true, html:
      '<div class="r-kicker a1">' + (d.finished ? 'That was' : 'So far, this is') + '</div>' +
      '<div class="r-huge a2">' + esc(s.name) + '</div>' +
      '<div class="r-sub a3">' + (d.finished ? 'Come back next year. These songs will take you right back.' : 'Keep pressing play. The recap grows as the season goes.') + '</div>' +
      '<div class="r-actions a4"><button id="r-share">Share your recap</button><button id="r-replay" class="ghost">Watch again</button></div>' });

    return slides;
  }

  /** Up to n items spread evenly across the list (so photos cover the whole season). */
  function pickSpread(list, n) {
    if (list.length <= n) return list.slice();
    var out = [];
    for (var i = 0; i < n; i++) out.push(list[Math.round(i * (list.length - 1) / (n - 1))]);
    return out;
  }

  // ---------- player ----------

  function shell() {
    var el = document.createElement('div');
    el.id = 'recap';
    el.innerHTML = '<div class="r-bars"></div><button class="r-close" aria-label="Close recap">×</button>' +
                   '<div class="r-stage"></div><div class="r-tap r-back"></div><div class="r-tap r-next"></div>';
    document.body.appendChild(el);
    document.body.classList.add('recap-open');
    el.querySelector('.r-close').onclick = close;
    el.querySelector('.r-back').onclick = function () { show(state.i - 1); };
    el.querySelector('.r-next').onclick = function () { show(state.i + 1); };
    document.addEventListener('keydown', onKey);
    return el;
  }

  function onKey(e) {
    if (!state) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === ' ') show(state.i + 1);
    else if (e.key === 'ArrowLeft') show(state.i - 1);
  }

  function loading(el, msg) {
    el.querySelector('.r-stage').innerHTML = '<div class="r-slide r-center"><div class="r-spin"></div><div class="r-sub">' + esc(msg) + '</div></div>';
  }

  function show(i) {
    if (!state || i < 0 || i >= state.slides.length) return;
    state.i = i;
    var el = document.getElementById('recap'), s = state.slides[i];
    el.style.background = s.bg;
    el.querySelector('.r-bars').innerHTML = state.slides.map(function (_, j) {
      return '<span class="' + (j < i ? 'done' : j === i ? 'now' : '') + '"></span>';
    }).join('');
    el.querySelector('.r-stage').innerHTML = '<div class="r-slide">' + s.html + '</div>';
    el.querySelector('.r-next').style.display = s.final ? 'none' : '';
    if (s.final) {
      el.querySelector('#r-share').onclick = share;
      el.querySelector('#r-replay').onclick = function () { show(0); };
    }
  }

  function close() {
    var el = document.getElementById('recap');
    if (el) el.remove();
    document.body.classList.remove('recap-open');
    document.removeEventListener('keydown', onKey);
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
    var cb = state && state.onClose;
    state = null;
    if (cb) cb();
  }

  /**
   * Open the recap for a season.
   *   opts.color      header colour for the season
   *   opts.sync       if true, refresh Last.fm history for the season first
   *   opts.onClose    called when closed
   */
  function open(season, opts) {
    opts = opts || {};
    var el = shell();
    el.style.background = 'linear-gradient(160deg,' + opts.color + ' 0%, #121212 85%)';
    loading(el, 'Gathering your season…');
    var todayKey = Logic.dateKey(new Date());
    var end = season.end < todayKey ? season.end : todayKey;

    var sync = opts.sync ? LastFM.syncDays(season.start, end).catch(function () { /* fall back to what's cached */ }) : Promise.resolve();
    sync.then(function () {
      return Promise.all([DB.entriesBetween(season.start, season.end), DB.playsBetween(season.start, season.end)]);
    }).then(function (r) {
      if (!document.getElementById('recap')) return; // closed while loading
      var s = {}; for (var k in season) s[k] = season[k];
      s.color = opts.color;
      var data = Logic.recapData(s, r[0], r[1], todayKey);
      state = { data: data, entries: r[0], i: 0, onClose: opts.onClose,
                slides: data.isEmpty ? [emptySlide(s)] : buildSlides(data, r[0]) };
      if (data.finished && !data.isEmpty) markSeen(season.id);
      show(0);
    }).catch(function (err) {
      loading(el, 'Couldn’t build the recap: ' + err.message);
    });
  }

  function emptySlide(s) {
    return { bg: 'linear-gradient(160deg,' + s.color + ' 0%, #121212 85%)', final: false, html:
      '<div class="r-kicker a1">' + esc(s.name) + '</div>' +
      '<div class="r-title a2">Nothing here yet.</div>' +
      '<div class="r-sub a3">Press play on your season playlist and write a few notes. Your recap fills in as you go.</div>' };
  }

  // ---------- seen flags ----------

  function seen() { try { return JSON.parse(localStorage.getItem('sc.recapSeen') || '{}'); } catch (e) { return {}; } }
  function markSeen(id) { var s = seen(); s[id] = true; localStorage.setItem('sc.recapSeen', JSON.stringify(s)); }
  function hasSeen(id) { return !!seen()[id]; }

  // ---------- share image ----------

  function share() {
    var btn = document.getElementById('r-share');
    if (btn) { btn.disabled = true; btn.textContent = 'Making your image…'; }
    var d = state.data, cover = d.photos.length ? photoBlob(state.entries, d.photos[d.photos.length >> 1]) : null;
    drawCard(d, cover).then(function (blob) {
      var name = d.season.name.replace(/[^\w]+/g, '-') + '-recap.png';
      var file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: d.season.name + ' recap' }).catch(function (e) {
          if (e && e.name !== 'AbortError') download(blob, name);
        });
      }
      download(blob, name);
    }).catch(function (err) {
      alert('Couldn’t make the image: ' + err.message);
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Share your recap'; }
    });
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function loadImage(blob) {
    return new Promise(function (resolve) {
      if (!blob) return resolve(null);
      var img = new Image(), u = URL.createObjectURL(blob);
      img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(u); resolve(null); };
      img.src = u;
    });
  }

  var FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

  /** Shorten text with an ellipsis so it fits maxW at the current font. */
  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** 1080x1920 story-sized recap card. Album art is skipped (cross-origin images can't be exported). */
  function drawCard(d, coverBlob) {
    return loadImage(coverBlob).then(function (photo) {
      var W = 1080, H = 1920, P = 90, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, d.season.color); g.addColorStop(0.55, '#121212'); g.addColorStop(1, '#121212');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = '700 36px ' + FONT;
      ctx.fillText('SEASON CAPSULES', P, 150);
      ctx.fillStyle = '#fff';
      ctx.font = '900 120px ' + FONT;
      ctx.fillText(fit(ctx, d.season.name, W - 2 * P), P, 290);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = '500 38px ' + FONT;
      ctx.fillText(Logic.prettyDay(d.season.start, true) + ' – ' + Logic.prettyDay(d.season.end, true), P, 355);

      var y = 420, box = 520;
      ctx.save();
      roundRect(ctx, P, y, box, box, 24); ctx.clip();
      if (photo) {
        var sc = Math.max(box / photo.naturalWidth, box / photo.naturalHeight);
        var w = photo.naturalWidth * sc, h = photo.naturalHeight * sc;
        ctx.drawImage(photo, P + (box - w) / 2, y + (box - h) / 2, w, h);
      } else {
        ctx.fillStyle = '#1ed760'; ctx.fillRect(P, y, box, box);
        ctx.fillStyle = '#121212';
        ctx.beginPath(); ctx.arc(P + box / 2, y + box / 2, 150, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1ed760';
        ctx.beginPath(); ctx.arc(P + box / 2, y + box / 2, 40, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // stats beside the image
      var sx = P + box + 50, sw = W - sx - P;
      var stat = function (label, value, yy) {
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 30px ' + FONT; ctx.fillText(label, sx, yy);
        ctx.fillStyle = '#fff'; ctx.font = '800 64px ' + FONT; ctx.fillText(fit(ctx, value, sw), sx, yy + 70);
      };
      stat('Plays', d.stats.plays.toLocaleString(), y + 40);
      stat('Hours', '~' + Math.max(d.hours, d.stats.plays ? 1 : 0), y + 210);
      stat('Days written', String(d.stats.journaledDays), y + 380);

      y += box + 110;
      if (d.topSong) {
        ctx.fillStyle = '#1ed760'; ctx.font = '700 34px ' + FONT;
        ctx.fillText('SONG OF THE SEASON', P, y);
        ctx.fillStyle = '#fff'; ctx.font = '800 72px ' + FONT;
        ctx.fillText(fit(ctx, d.topSong.name, W - 2 * P), P, y + 85);
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '500 42px ' + FONT;
        ctx.fillText(fit(ctx, d.topSong.artist + ' · ' + d.topSong.plays + ' plays', W - 2 * P), P, y + 145);
        y += 230;
      }

      var list = d.stats.topTracks.slice(d.topSong ? 1 : 0, 5);
      if (list.length) {
        ctx.fillStyle = '#1ed760'; ctx.font = '700 34px ' + FONT;
        ctx.fillText('ALSO ON REPEAT', P, y);
        y += 70;
        list.forEach(function (t, i) {
          ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '700 44px ' + FONT;
          ctx.fillText(String(i + (d.topSong ? 2 : 1)), P, y);
          ctx.fillStyle = '#fff'; ctx.font = '600 44px ' + FONT;
          ctx.fillText(fit(ctx, t.name + '  –  ' + t.artist, W - 2 * P - 70), P + 70, y);
          y += 72;
        });
      }

      if (d.topArtist && y < H - 220) {
        y += 40;
        ctx.fillStyle = '#1ed760'; ctx.font = '700 34px ' + FONT;
        ctx.fillText('TOP ARTIST', P, y);
        ctx.fillStyle = '#fff'; ctx.font = '800 60px ' + FONT;
        ctx.fillText(fit(ctx, d.topArtist.name, W - 2 * P), P, y + 75);
      }

      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '500 32px ' + FONT;
      ctx.fillText('Made with Season Capsules', P, H - 90);

      return new Promise(function (resolve, reject) {
        cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('image export failed')); }, 'image/png');
      });
    });
  }

  return { open: open, hasSeen: hasSeen };
})();
