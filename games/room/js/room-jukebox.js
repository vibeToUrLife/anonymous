    /* ═══════════════════════════════
       7. JUKEBOX (Web Audio API)
       ═══════════════════════════════ */
    let _audioCtx = null;
    let _jukeboxNodes = [];
    let _jukeboxPlaying = null;
    let _jukeboxGain = null;

    function getAudioCtx() {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        _jukeboxGain = _audioCtx.createGain();
        _jukeboxGain.gain.value = roomData.jukeboxVol ?? 0.5;
        _jukeboxGain.connect(_audioCtx.destination);
      }
      return _audioCtx;
    }

    function stopJukebox() {
      _jukeboxNodes.forEach(n => { try { n.stop(); } catch(e) {} try { n.disconnect(); } catch(e) {} });
      _jukeboxNodes = [];
      _jukeboxPlaying = null;
    }

    function playJukeboxTrack(trackId) {
      if (viewingUid !== currentUid) return;
      stopJukebox();
      const track = JUKEBOX_TRACKS.find(t => t.id === trackId);
      if (!track) return;
      const ctx = getAudioCtx();
      _jukeboxPlaying = trackId;

      const isAmbient = ['rain','forest','ocean','space'].includes(track.style);
      if (isAmbient) {
        // Ambient noise generation
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0=0,b1=0,b2=0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          if (track.style === 'rain') {
            // Rain with varying intensity
            const dropChance = Math.sin(i / (ctx.sampleRate * 2)) * 0.5 + 0.5;
            data[i] = white * (0.15 + dropChance * 0.2);
          } else if (track.style === 'ocean') {
            b0 = 0.99 * b0 + white * 0.1;
            data[i] = b0 * Math.sin(i / (ctx.sampleRate * 3)) * 2.5 * (0.6 + 0.4 * Math.sin(i / (ctx.sampleRate * 8)));
          } else if (track.style === 'space') {
            // Deep space drone with slow modulation
            b0 = 0.998 * b0 + white * 0.02;
            b1 = 0.995 * b1 + white * 0.05;
            data[i] = (b0 * Math.sin(i / (ctx.sampleRate * 6)) + b1 * 0.3) * 1.5;
          } else {
            // Forest — pink noise with bird chirp modulation
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.969 * b2 + white * 0.153852;
            const chirp = Math.sin(i / 800) > 0.95 ? Math.sin(i / 20) * 0.05 : 0;
            data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11 + chirp;
          }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer; src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = track.style === 'ocean' ? 400 : track.style === 'rain' ? 2000 : track.style === 'space' ? 300 : 800;
        src.connect(filter); filter.connect(_jukeboxGain);
        src.start();
        _jukeboxNodes.push(src);
        // Space: add tonal drone layer
        if (track.style === 'space') {
          [55, 82.41, 110].forEach(freq => {
            const drone = ctx.createOscillator();
            const dGain = ctx.createGain();
            drone.type = 'sine'; drone.frequency.value = freq;
            dGain.gain.value = 0.015;
            drone.connect(dGain); dGain.connect(_jukeboxGain);
            drone.start(); _jukeboxNodes.push(drone);
          });
        }
      } else {
        // Musical tones — unique melodies per style
        const noteMap = {
          'C':  [261.63,293.66,329.63,349.23,392,440,493.88],
          'Eb': [311.13,349.23,392,415.3,466.16,523.25,587.33],
          'G':  [392,440,493.88,523.25,587.33,659.25,739.99],
          'F':  [349.23,392,440,466.16,523.25,587.33,659.25],
          'D':  [293.66,329.63,369.99,392,440,493.88,554.37],
          'A':  [220,246.94,277.18,293.66,329.63,369.99,415.3]
        };
        const notes = noteMap[track.key] || noteMap['C'];
        const beatLen = 60 / (track.bpm || 80);
        // Different melody patterns per style
        const melodyPatterns = {
          lofi:    [0,2,4,3, 2,4,6,5, 4,2,3,1, 0,2,4,0],
          jazz:    [0,4,6,2, 5,3,6,4, 2,6,5,1, 3,0,4,2],
          retro:   [0,0,4,4, 5,5,4,-1, 3,3,2,2, 1,1,0,-1],
          piano:   [4,2,0,2, 4,4,4,-1, 2,2,2,-1, 4,6,6,-1],
          lullaby: [0,1,2,0, 2,3,4,-1, 4,5,4,3, 2,0,1,-1],
          bossa:   [0,2,4,2, 5,4,2,0, 3,5,6,4, 2,0,5,3],
          musicbox:[4,2,5,3, 6,4,2,0, 1,3,5,6, 4,2,0,1]
        };
        const pattern = melodyPatterns[track.style] || melodyPatterns.lofi;

        // Style-specific wave types and octave multipliers
        const waveTypes = { retro:'square', jazz:'triangle', bossa:'triangle', musicbox:'sine', lullaby:'sine', piano:'sine', lofi:'sine' };
        const octaveMul = { piano:0.5, lullaby:1, musicbox:2, bossa:1, retro:1, jazz:1, lofi:1 };
        const volume = { lofi:0.07, jazz:0.05, retro:0.04, piano:0.08, lullaby:0.06, bossa:0.05, musicbox:0.05 };

        function scheduleNotes() {
          if (_jukeboxPlaying !== trackId) return;
          const now = ctx.currentTime;
          for (let i = 0; i < 16; i++) {
            const noteIdx = pattern[i % 16];
            if (noteIdx < 0) continue; // rest note
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = waveTypes[track.style] || 'sine';
            const mul = octaveMul[track.style] || 1;
            osc.frequency.value = notes[noteIdx] * mul;
            const start = now + i * beatLen;
            const vol = volume[track.style] || 0.06;
            // Style-specific envelope shapes
            env.gain.setValueAtTime(0, start);
            if (track.style === 'musicbox') {
              env.gain.linearRampToValueAtTime(vol, start + 0.01);
              env.gain.exponentialRampToValueAtTime(0.001, start + beatLen * 1.5);
            } else if (track.style === 'lullaby') {
              env.gain.linearRampToValueAtTime(vol, start + 0.08);
              env.gain.exponentialRampToValueAtTime(0.001, start + beatLen * 1.2);
            } else if (track.style === 'bossa') {
              env.gain.linearRampToValueAtTime(vol, start + 0.02);
              env.gain.setValueAtTime(vol * 0.7, start + beatLen * 0.2);
              env.gain.exponentialRampToValueAtTime(0.001, start + beatLen * 0.85);
            } else {
              env.gain.linearRampToValueAtTime(vol, start + 0.05);
              env.gain.exponentialRampToValueAtTime(0.001, start + beatLen * 0.9);
            }
            osc.connect(env); env.connect(_jukeboxGain);
            osc.start(start); osc.stop(start + beatLen * 1.5);
            _jukeboxNodes.push(osc);
          }
          setTimeout(scheduleNotes, beatLen * 16 * 1000 - 200);
        }
        scheduleNotes();
      }
      roomData.jukeboxTrack = trackId;
      saveRoom();
      renderJukebox();
    }

    function renderJukebox() {
      const el = document.getElementById('jukeboxContent');
      if (!el) return;
      const current = JUKEBOX_TRACKS.find(t => t.id === _jukeboxPlaying);
      let html = '<div class="jukebox-now">' +
        '<div class="jukebox-title">' + (current ? '♫ ' + T(current.name) : T('No track playing')) + '</div>' +
        '<div class="jukebox-controls">' +
        '<button class="jukebox-btn" onclick="' + (_jukeboxPlaying ? 'stopJukebox();renderJukebox()' : '') + '" title="' + T('Stop') + '">⏹</button>' +
        '</div></div>';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="font-size:11px;color:rgba(255,255,255,.5)">🔊</span>' +
        '<input type="range" class="jukebox-vol" min="0" max="100" value="' + Math.round((roomData.jukeboxVol ?? 0.5) * 100) + '" oninput="setJukeboxVol(this.value)">' +
        '</div>';
      html += '<div class="jukebox-list">';
      JUKEBOX_TRACKS.forEach(t => {
        const playing = _jukeboxPlaying === t.id;
        html += '<div class="jukebox-track ' + (playing ? 'playing' : '') + '" onclick="playJukeboxTrack(\'' + t.id + '\')">' +
          (playing ? '▶ ' : '♪ ') + T(t.name) + '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }

    function setJukeboxVol(val) {
      if (viewingUid !== currentUid) return;
      const v = Math.max(0, Math.min(1, val / 100));
      roomData.jukeboxVol = v;
      if (_jukeboxGain) _jukeboxGain.gain.value = v;
      saveRoom();
    }

