/* ============================================================
   Pulse Music — player.js
   Audio Engine & Playback Controller
   iOS-Stable Version: audio.paused is the single source of truth
   ============================================================ */
(function () {
  'use strict';

  // ── Helper: dispatch custom event on document ───────────────
  const emit = (name, detail = {}) => {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const emitProgress = () => {
    if (!state.audio) return;
    const current = state.audio.currentTime || 0;
    const total = state.audio.duration || 0;
    emit('player:timeupdate', {
      current,
      total,
      percentage: total ? (current / total) * 100 : 0
    });
  };

  // ── Player state ────────────────────────────────────────────
  const state = {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isShuffle: false,
    repeatMode: 'off', // 'off' | 'one' | 'all'
    volume: 0.7,
    previousVolume: 0.7,
    isMuted: false,
    audio: null,
    audioContext: null,
    analyser: null,
    sourceNode: null,
    rafId: null,
    playbackIntent: false
    // NOTE: NO isPlaying in state. We use audio.paused as the single source of truth.
    // This is the #1 cause of iOS desync: a stale boolean that diverges from reality.
  };

  const PLAYBACK_SESSION_KEY = 'aurafy_playback_session_v1';
  const PERSISTED_TRACK_FIELDS = [
    'id', 'title', 'artist', 'artistId', 'album', 'albumId', 'duration',
    'coverUrl', 'audioUrl', 'audioQuality', 'source', 'genre'
  ];
  let lastPlaybackSaveAt = 0;
  let pendingPlaybackRestore = null;
  let pipWindow = null;
  let lastPipUpdateAt = 0;

  const serializableTrack = (track) => {
    if (!track || typeof track !== 'object') return null;
    const saved = {};
    PERSISTED_TRACK_FIELDS.forEach((field) => {
      if (track[field] === undefined || track[field] === null) return;
      saved[field] = track[field];
    });
    if (typeof saved.audioUrl === 'string' && /^(blob:|data:)/i.test(saved.audioUrl)) saved.audioUrl = '';
    if (typeof saved.coverUrl === 'string' && /^(blob:|data:)/i.test(saved.coverUrl)) saved.coverUrl = '';
    return saved.id ? saved : null;
  };

  const persistPlaybackSession = (force = false) => {
    if (!state.currentTrack || !state.audio) return;
    const now = Date.now();
    if (!force && now - lastPlaybackSaveAt < 1400) return;
    lastPlaybackSaveAt = now;
    const track = serializableTrack(state.currentTrack);
    if (!track) return;
    const queue = state.queue.slice(0, 60).map(serializableTrack).filter(Boolean);
    const snapshot = {
      track,
      queue,
      queueIndex: state.queueIndex,
      currentTime: Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0,
      wasPlaying: state.playbackIntent || !state.audio.paused,
      savedAt: now
    };
    try { sessionStorage.setItem(PLAYBACK_SESSION_KEY, JSON.stringify(snapshot)); } catch (_) {}
  };

  const showPlayerToast = (message) => {
    if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(message);
  };

  const restorePlaybackSession = () => {
    if (!pendingPlaybackRestore || !state.audio) return;
    const snapshot = pendingPlaybackRestore;
    if (snapshot.restoreStarted) return;
    let track = snapshot.track;
    if (!track) return;

    // Imported files use temporary blob URLs. Rebuild those from IndexedDB once
    // LocalFiles has restored its object URLs after this page reloads.
    if ((!track.audioUrl || /^blob:/i.test(track.audioUrl)) && window.MusicData && track.id) {
      const restored = MusicData.getTrackById(track.id);
      if (restored && restored.audioUrl && !/^blob:/i.test(track.audioUrl || '')) {
        track = { ...track, ...restored };
      } else if (restored && restored.audioUrl && /^blob:/i.test(restored.audioUrl)) {
        track = { ...track, ...restored };
      }
    }

    state.currentTrack = track;
    state.queue = (Array.isArray(snapshot.queue) ? snapshot.queue : []).map((savedTrack) => {
      if (savedTrack && savedTrack.audioUrl && !/^blob:/i.test(savedTrack.audioUrl)) return savedTrack;
      const restored = window.MusicData && savedTrack && MusicData.getTrackById(savedTrack.id);
      return restored && restored.audioUrl ? { ...savedTrack, ...restored } : savedTrack;
    });
    state.queueIndex = Number.isInteger(snapshot.queueIndex) ? snapshot.queueIndex : -1;
    state.playbackIntent = Boolean(snapshot.wasPlaying);
    updateMediaSession(track);
    setMediaSessionState(snapshot.wasPlaying ? 'playing' : 'paused');

    // Keep the player UI populated even while the local-file database is opening.
    if (window.UI && typeof window.UI.updatePlayerUI === 'function') window.UI.updatePlayerUI(track);
    emit('player:trackchange', { track, restored: true });

    if (!track.audioUrl) {
      // Local file restore may finish just after Player.init().
      return;
    }

    const savedTime = Math.max(0, Number(snapshot.currentTime) || 0);
    const shouldResume = Boolean(snapshot.wasPlaying);
    let positionRestored = false;
    const restorePosition = () => {
      if (positionRestored) return;
      positionRestored = true;
      if (state.currentTrack !== track) return;
      if (savedTime > 0 && Number.isFinite(state.audio.duration) && savedTime < state.audio.duration) {
        try { state.audio.currentTime = savedTime; } catch (_) {}
      }
      if (shouldResume) {
        state.audio.play().catch((error) => {
          // Browsers may block autoplay after reload. The track and position
          // stay restored so the user can resume with the normal play button.
          console.info('[Player] Resume after refresh needs a user gesture:', error && error.name);
          setMediaSessionState('paused');
          emit('player:pause');
          showPlayerToast('Song restored. Press play to continue from where you left off.');
        });
      }
      pendingPlaybackRestore = null;
      persistPlaybackSession(true);
    };

    snapshot.restoreStarted = true;
    state.audio.src = track.audioUrl;
    state.audio.addEventListener('loadedmetadata', restorePosition, { once: true });
    state.audio.load();
    if (state.audio.readyState >= 1) restorePosition();
  };

  const pipTime = (seconds) => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };

  const updatePipWindow = (force = false) => {
    if (!pipWindow || pipWindow.closed) return;
    const now = performance.now();
    if (!force && now - lastPipUpdateAt < 250) return;
    lastPipUpdateAt = now;
    const doc = pipWindow.document;
    const track = state.currentTrack;
    const title = doc.getElementById('aurafy-pip-title');
    const artist = doc.getElementById('aurafy-pip-artist');
    const art = doc.getElementById('aurafy-pip-art');
    const play = doc.getElementById('aurafy-pip-play');
    const previous = doc.querySelector('[data-pip-action="previous"]');
    const next = doc.querySelector('[data-pip-action="next"]');
    const progress = doc.getElementById('aurafy-pip-progress');
    const current = doc.getElementById('aurafy-pip-current');
    const total = doc.getElementById('aurafy-pip-total');
    if (!track) return;
    if (title) title.textContent = track.title || 'No track playing';
    if (artist) artist.textContent = track.artist || '—';
    if (art && track.coverUrl && art.src !== track.coverUrl) art.src = track.coverUrl;
    if (play) {
      const isPlaying = Boolean(state.audio && !state.audio.paused);
      play.innerHTML = isPlaying
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      play.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      play.title = isPlaying ? 'Pause' : 'Play';
    }
    [previous, next].filter(Boolean).forEach((button) => {
      button.disabled = !state.queue.length;
      button.setAttribute('aria-disabled', String(button.disabled));
    });
    const duration = state.audio && Number.isFinite(state.audio.duration) ? state.audio.duration : Number(track.duration) || 0;
    const position = state.audio ? state.audio.currentTime || 0 : 0;
    if (progress) {
      progress.max = String(Math.max(1, duration));
      if (!progress.matches(':active')) progress.value = String(Math.min(position, duration || position));
    }
    if (current) current.textContent = pipTime(position);
    if (total) total.textContent = pipTime(duration);
  };

  const openPictureInPicture = async () => {
    if (!state.currentTrack) {
      showPlayerToast('Play a song before opening Picture-in-Picture.');
      return;
    }
    if (!window.documentPictureInPicture || typeof window.documentPictureInPicture.requestWindow !== 'function') {
      showPlayerToast('Picture-in-Picture mini player requires a recent Chrome or Edge browser.');
      return;
    }
    if (pipWindow && !pipWindow.closed) {
      pipWindow.focus();
      return;
    }

    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 360, height: 210 });
      const doc = pipWindow.document;
      doc.title = 'Aurafy mini player';
      const style = doc.createElement('style');
      style.textContent = `
        *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#0b1220;color:#f5f7ff;font:14px system-ui,-apple-system,Segoe UI,sans-serif}
        .pip-shell{height:100%;padding:14px;display:grid;grid-template-rows:minmax(0,1fr) 5px 38px;gap:10px;background:radial-gradient(ellipse at 0 0,rgba(93,103,221,.3),transparent 60%),linear-gradient(135deg,#111a2c,#102d48)}
        .pip-track{display:flex;align-items:center;gap:13px;min-width:0}.pip-art{width:76px;height:76px;flex:0 0 76px;object-fit:cover;border-radius:12px;background:#202b40;box-shadow:0 5px 18px #0006}.pip-copy{min-width:0}.pip-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;font-size:15px}.pip-artist{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aab8cd;margin-top:5px;font-size:12px}.pip-state{color:#8ac8ff;font-size:10px;text-transform:uppercase;letter-spacing:.12em;margin-top:9px}
        .pip-progress{width:100%;height:5px;margin:0;accent-color:#69b8ee;cursor:pointer}.pip-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.pip-time{min-width:32px;color:#aebbd0;font-size:10px;font-variant-numeric:tabular-nums;text-align:center}.pip-controls{display:flex;flex:1;align-items:center;justify-content:center;gap:10px}.pip-btn{appearance:none;-webkit-appearance:none;display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:34px;height:34px;margin:0;padding:0;border:1px solid transparent;border-radius:50%;background:transparent;color:#d7e3f6;font:inherit;line-height:1;cursor:pointer;transition:background 140ms ease,border-color 140ms ease,color 140ms ease,transform 140ms ease;touch-action:manipulation}.pip-btn svg{display:block;width:17px;height:17px;fill:currentColor;pointer-events:none}.pip-btn:hover:not(:disabled){transform:translateY(-1px);border-color:#ffffff20;background:#ffffff12;color:#fff}.pip-btn:active:not(:disabled){transform:scale(.94)}.pip-btn:disabled{color:#75839a;opacity:.42;cursor:not-allowed}.pip-btn-main{width:38px;height:38px;border-color:#a5d8ff70;background:linear-gradient(145deg,#65b9ee,#527ce0);color:#fff;box-shadow:0 4px 14px #3974d566,inset 0 1px 0 #ffffff55}.pip-btn-main svg{width:19px;height:19px}.pip-btn-main:hover:not(:disabled){border-color:#c2e7ff;background:linear-gradient(145deg,#7ac7f5,#648cf0);box-shadow:0 5px 18px #3974d588,inset 0 1px 0 #ffffff66}.pip-btn:focus-visible,.pip-progress:focus-visible{outline:2px solid #8ac8ff;outline-offset:2px}`;
      doc.head.appendChild(style);
      doc.body.innerHTML = '<main class="pip-shell"><section class="pip-track"><img class="pip-art" id="aurafy-pip-art" alt="Album cover"><div class="pip-copy"><div class="pip-title" id="aurafy-pip-title"></div><div class="pip-artist" id="aurafy-pip-artist"></div><div class="pip-state">Aurafy · Now playing</div></div></section><input class="pip-progress" id="aurafy-pip-progress" type="range" min="0" max="1" value="0" aria-label="Seek in track"><footer class="pip-footer"><span class="pip-time" id="aurafy-pip-current">0:00</span><div class="pip-controls"><button class="pip-btn" data-pip-action="previous" aria-label="Previous track" title="Previous track"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19 5 8 12l11 7z"/></svg></button><button class="pip-btn pip-btn-main" id="aurafy-pip-play" data-pip-action="toggle" aria-label="Play" title="Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button><button class="pip-btn" data-pip-action="next" aria-label="Next track" title="Next track"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 5l11 7-11 7z"/></svg></button></div><span class="pip-time" id="aurafy-pip-total">0:00</span></footer></main>';
      doc.addEventListener('click', (event) => {
        const button = event.target.closest('[data-pip-action]');
        if (!button) return;
        if (button.dataset.pipAction === 'toggle') Player.togglePlay();
        else if (button.dataset.pipAction === 'previous') Player.previous();
        else if (button.dataset.pipAction === 'next') Player.next();
      });
      doc.getElementById('aurafy-pip-progress').addEventListener('change', (event) => {
        Player.seek((Number(event.target.value) / Number(event.target.max || 1)) * 100);
      });
      pipWindow.addEventListener('pagehide', () => { pipWindow = null; }, { once: true });
      updatePipWindow(true);
    } catch (error) {
      pipWindow = null;
      console.warn('[Player] Could not open Picture-in-Picture:', error);
      showPlayerToast('Could not open the Picture-in-Picture player.');
    }
  };

  // ── Animation loop for time updates ─────────────────────────
  const tick = () => {
    if (!state.audio || state.audio.paused) {
      state.rafId = null;
      return;
    }
    emitProgress();
    state.rafId = requestAnimationFrame(tick);
  };

  const startTick = () => {
    if (state.rafId === null) state.rafId = requestAnimationFrame(tick);
  };

  const stopTick = () => {
    if (state.rafId !== null) cancelAnimationFrame(state.rafId);
    state.rafId = null;
  };

  // ── Shuffle helper: Fisher-Yates ────────────────────────────
  const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ── Update MediaSession metadata ────────────────────────────
  const updateMediaSession = (track) => {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.coverUrl ? [
        { src: track.coverUrl, sizes: '300x300', type: 'image/jpeg' }
      ] : []
    });
  };

  // Browsers do not expose the OS Bluetooth route directly. Use available
  // audio-output labels when available, then use a loopback-only host probe on
  // Windows where browser privacy rules hide the active system output name.
  let outputDeviceCheckId = 0;
  let outputDevicePollTimer = null;
  let outputDeviceRefreshBound = false;
  const ensureBluetoothIndicator = () => {
    const right = document.getElementById('player-right');
    if (!right) return null;
    let indicator = document.getElementById('player-bluetooth-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'player-output-indicator';
      indicator.id = 'player-bluetooth-indicator';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-label', 'Bluetooth audio output status is managed by your device');
      indicator.title = 'Bluetooth output status is managed by your device settings';
      indicator.hidden = true;
      indicator.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.71 7.71 12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71L13.41 12l4.3-4.29zM13 5.83l2.59 2.59L13 11V5.83zm2.59 9.75L13 18.17v-5.34l2.59 2.75z"/></svg>';
      const volume = right.querySelector('.volume-container');
      right.insertBefore(indicator, volume || null);
    }
    return indicator;
  };

  const ensureFullscreenBluetoothIndicator = () => {
    const controls = document.querySelector('.fs-player-controls');
    if (!controls) return null;
    let indicator = document.getElementById('fs-bluetooth-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'player-output-indicator fs-output-indicator';
      indicator.id = 'fs-bluetooth-indicator';
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-label', 'Bluetooth audio output status is managed by your device');
      indicator.title = 'Bluetooth output status is managed by your device settings';
      indicator.hidden = true;
      indicator.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.71 7.71 12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71L13.41 12l4.3-4.29zM13 5.83l2.59 2.59L13 11V5.83zm2.59 9.75L13 18.17v-5.34l2.59 2.75z"/></svg>';
      controls.appendChild(indicator);
    }
    return indicator;
  };

  const setBluetoothIndicators = (connected, label) => {
    [ensureBluetoothIndicator(), ensureFullscreenBluetoothIndicator()].filter(Boolean).forEach((indicator) => {
      indicator.hidden = !connected;
      indicator.classList.toggle('is-connected', connected);
      indicator.title = label;
      indicator.setAttribute('aria-label', label);
    });
  };

  const refreshBluetoothOutput = async () => {
    if (!ensureBluetoothIndicator() && !ensureFullscreenBluetoothIndicator()) return;
    const checkId = ++outputDeviceCheckId;
    try {
      const response = await fetch('/api/audio-output', { cache: 'no-store' });
      if (response.ok) {
        const hostStatus = await response.json();
        if (checkId !== outputDeviceCheckId) return;
        if (hostStatus.available) {
          setBluetoothIndicators(Boolean(hostStatus.isBluetooth), hostStatus.isBluetooth
            ? 'Bluetooth audio output connected'
            : 'Bluetooth audio output is not active');
          return;
        }
      }
    } catch (_) {
      // Hosted/non-Windows versions fall back to browser-visible output labels.
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
      setBluetoothIndicators(false, 'Bluetooth output status is managed by your device settings');
      return;
    }

    try {
      const devices = await mediaDevices.enumerateDevices();
      if (checkId !== outputDeviceCheckId) return;
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput' && device.label);
      // A listed Bluetooth device may only be paired. Show the badge only
      // when the browser identifies it as the current default output.
      const bluetoothDevice = audioOutputs.find(device => device.deviceId === 'default' &&
        /bluetooth|airpods?|beats|wireless|\bbuds\b|\bwh[-\s]?\d|\bwf[-\s]?\d|jbl|bose|sony|jabra|soundcore|anker|sennheiser|skullcandy|marshall|plantronics|poly|bang\s*&\s*olufsen/i.test(device.label)
      );
      if (bluetoothDevice) {
        const label = bluetoothDevice.label.replace(/^default\s*[-:—]\s*/i, '').trim();
        setBluetoothIndicators(true, `Bluetooth audio output connected${label ? `: ${label}` : ''}`);
      } else {
        setBluetoothIndicators(false, 'Bluetooth output status is managed by your device settings');
      }
    } catch (error) {
      // Device enumeration can be blocked by browser privacy settings.
      setBluetoothIndicators(false, 'Bluetooth output status is managed by your device settings');
    }
  };

  // ── Set MediaSession playback state ────────────────────────
  const setMediaSessionState = (playbackState) => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playbackState;
    }
  };

  // ── Setup MediaSession handlers ─────────────────────────────
  const setupMediaSession = () => {
    if (!('mediaSession' in navigator)) return;
    // These are the handlers iOS/Android lock screen and control center calls.
    // They MUST call the actual play/pause on the audio element directly.
    navigator.mediaSession.setActionHandler('play', () => Player.resume());
    navigator.mediaSession.setActionHandler('pause', () => Player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => Player.previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => Player.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (state.audio && details.seekTime != null) {
        state.audio.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skip = details.seekOffset || 10;
      state.audio.currentTime = Math.max(0, state.audio.currentTime - skip);
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skip = details.seekOffset || 10;
      state.audio.currentTime = Math.min(state.audio.duration || 0, state.audio.currentTime + skip);
    });
  };

  // ── Ensure AudioContext + AnalyserNode (desktop only) ───────
  const ensureAudioContext = () => {
    if (state.audioContext) return;

    // CRITICAL iOS FIX: NEVER create a Web Audio API context on iOS/iPadOS.
    // The AudioContext is suspended by the OS when the app goes to background,
    // which cuts off audio completely. We use the plain HTMLAudioElement instead,
    // which iOS handles natively and allows background playback.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isIOS || isAndroid) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioCtx();

      // Keep the low end controlled and gently lift vocal intelligibility.
      // The previous +6 dB bass shelf masked voices and made some streams sound muddy.
      state.rumbleFilter = state.audioContext.createBiquadFilter();
      state.rumbleFilter.type = 'highpass';
      state.rumbleFilter.frequency.value = 35;
      state.rumbleFilter.Q.value = 0.707;

      state.voiceClarityFilter = state.audioContext.createBiquadFilter();
      state.voiceClarityFilter.type = 'peaking';
      state.voiceClarityFilter.frequency.value = 2800;
      state.voiceClarityFilter.Q.value = 0.8;
      state.voiceClarityFilter.gain.value = 1.5;

      state.compressor = state.audioContext.createDynamicsCompressor();
      state.compressor.threshold.value = -18;
      state.compressor.knee.value = 18;
      state.compressor.ratio.value = 1.8;
      state.compressor.attack.value = 0.01;
      state.compressor.release.value = 0.22;

      state.gainNode = state.audioContext.createGain();
      state.gainNode.gain.value = 1;

      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 256;
      state.analyser.smoothingTimeConstant = 0.8;

      state.sourceNode = state.audioContext.createMediaElementSource(state.audio);
      state.sourceNode.connect(state.rumbleFilter);
      state.rumbleFilter.connect(state.voiceClarityFilter);
      state.voiceClarityFilter.connect(state.compressor);
      state.compressor.connect(state.gainNode);
      state.gainNode.connect(state.analyser);
      state.analyser.connect(state.audioContext.destination);
    } catch (err) {
      console.warn('[Player] Web Audio API unavailable:', err);
    }
  };

  // ── Public Player API ───────────────────────────────────────
  const Player = {

    /* ---- Getters ---- */
    get currentTrack() { return state.currentTrack; },
    get queue() { return state.queue; },
    get queueIndex() { return state.queueIndex; },
    // isPlaying reads directly from the audio element — NEVER from a cached boolean.
    // This is the permanent fix for iOS lock screen desync.
    get isPlaying() { return state.audio ? !state.audio.paused : false; },
    get isShuffle() { return state.isShuffle; },
    get repeatMode() { return state.repeatMode; },
    get volume() { return state.volume; },
    get isMuted() { return state.isMuted; },
    openPictureInPicture,
    get analyser() { return state.analyser; },
    get audio() { return state.audio; },

    /* ---- Initialise ---- */
    init() {
      state.audio = new Audio();
      // Do NOT set crossOrigin on iOS — it prevents iOS from caching/resuming audio
      const isIOS_init = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
        ('ontouchend' in document && /Mac/.test(navigator.userAgent));
      if (!isIOS_init) state.audio.crossOrigin = 'anonymous';
      state.audio.preload = 'auto';
      // Required for iOS to not force fullscreen video player
      state.audio.playsInline = true;
      state.audio.setAttribute('webkit-playsinline', 'true');
      state.audio.style.display = 'none';
      // Required for iOS: audio element MUST be in the DOM to allow background playback
      document.body.appendChild(state.audio);

      // Restore saved volume
      const savedVol = localStorage.getItem('pulse_volume');
      if (savedVol !== null) state.volume = parseFloat(savedVol);
      state.audio.volume = state.volume;

      // --- Native audio element events are the ONLY source of truth ---
      // This ensures iOS lock screen, control center, and app switching
      // ALL stay perfectly in sync with the real audio state.

      state.audio.addEventListener('playing', () => {
        // 'playing' fires when audio actually starts making sound (after buffering)
        setMediaSessionState('playing');
        state.playbackIntent = true;
        emit('player:play', { track: state.currentTrack });
        emitProgress();
        startTick();
        refreshBluetoothOutput();
        console.log('[Player] playing');
      });

      state.audio.addEventListener('pause', () => {
        // 'pause' fires whether WE pause it or iOS pauses it in background
        setMediaSessionState('paused');
        stopTick();
        emitProgress();
        emit('player:pause');
        console.log('[Player] pause');
      });

      state.audio.addEventListener('ended', () => {
        emit('player:ended');
        if (state.repeatMode === 'one') {
          state.audio.currentTime = 0;
          state.audio.play().catch(() => {});
        } else {
          if (!state.queue.length) state.playbackIntent = false;
          Player.next();
        }
      });

      // Sync position to OS lock screen progress bar every tick
      state.audio.addEventListener('timeupdate', () => {
        // Native media time keeps lyrics/progress moving even when the tab is
        // backgrounded and requestAnimationFrame is throttled or suspended.
        emitProgress();
        if ('setPositionState' in navigator.mediaSession &&
            state.audio.duration && !isNaN(state.audio.duration)) {
          try {
            navigator.mediaSession.setPositionState({
              duration: state.audio.duration,
              playbackRate: state.audio.playbackRate || 1,
              position: Math.min(state.audio.currentTime, state.audio.duration)
            });
          } catch (e) {}
        }
      });
      state.audio.addEventListener('seeked', emitProgress);
      state.audio.addEventListener('loadedmetadata', emitProgress);

      state.audio.addEventListener('error', (e) => {
        console.error('[Player] Audio error:', e);
        emit('player:error', { error: e });
        if (window.UI && state.currentTrack) {
          const message = state.audio.error && state.audio.error.code === 4
            ? 'This audio format or stream is not supported.'
            : 'Could not play this track. Check the connection or choose another track.';
          window.UI.showToast(message);
        }
      });

      // iOS FIX: When app returns to foreground, force re-sync the audio state.
      // iOS silently deallocates decoded audio frames in background.
      // We track whether audio was supposed to be playing when we went to background.
      let wasPlayingBeforeHidden = false;
      document.addEventListener('visibilitychange', () => {
        const isIOS_vis = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (!isIOS_vis || !state.currentTrack) return;

        if (document.visibilityState === 'hidden') {
          // Remember if audio was playing when we go to background
          wasPlayingBeforeHidden = !state.audio.paused;
        } else if (document.visibilityState === 'visible' && wasPlayingBeforeHidden) {
          // Came back to foreground and audio was supposed to be playing.
          // If iOS silently killed it, reload.
          setTimeout(() => {
            if (state.audio.paused && wasPlayingBeforeHidden) {
              // iOS paused it behind our back — reload and resume
              console.warn('[Player] iOS silently paused audio in background, reloading...');
              Player._reloadAndResume();
            }
          }, 300);
        }
      });

      setupMediaSession();
      ensureBluetoothIndicator();
      refreshBluetoothOutput();
      if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', refreshBluetoothOutput);
      }
      if (!outputDeviceRefreshBound) {
        window.addEventListener('focus', refreshBluetoothOutput);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') refreshBluetoothOutput();
        });
        outputDevicePollTimer = setInterval(() => {
          if (document.visibilityState === 'visible') refreshBluetoothOutput();
        }, 15000);
        outputDeviceRefreshBound = true;
      }

      ['player:play', 'player:pause', 'player:queuechange'].forEach((eventName) => {
        document.addEventListener(eventName, () => {
          persistPlaybackSession(true);
          updatePipWindow(true);
        });
      });
      document.addEventListener('player:trackchange', (event) => {
        if (!(event.detail && event.detail.restored)) persistPlaybackSession(true);
        updatePipWindow(true);
      });
      document.addEventListener('player:timeupdate', () => {
        persistPlaybackSession();
        updatePipWindow();
      });
      document.addEventListener('localfiles:updated', restorePlaybackSession);
      window.addEventListener('pagehide', () => persistPlaybackSession(true));
      window.addEventListener('beforeunload', () => persistPlaybackSession(true));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persistPlaybackSession(true);
      });

      try {
        const saved = sessionStorage.getItem(PLAYBACK_SESSION_KEY);
        const parsed = saved ? JSON.parse(saved) : null;
        if (parsed && parsed.track && parsed.track.id) pendingPlaybackRestore = parsed;
      } catch (_) {
        pendingPlaybackRestore = null;
      }
      // Defer restoration until App.init has connected its player event listeners.
      setTimeout(restorePlaybackSession, 0);
      stopTick();
      console.log('[Player] Initialised (iOS-stable mode)');
    },

    /* ---- Play a specific track ---- */
    play(track, queueIndex = -1) {
      if (!track) return;
      if (!track.audioUrl) {
        if (window.UI) window.UI.showToast(track.source === 'local'
          ? 'This imported file is unavailable. Import it again to play it.'
          : 'No playable audio source is available for this track.');
        return;
      }
      state.currentTrack = track;
      state.playbackIntent = true;
      if (queueIndex >= 0) state.queueIndex = queueIndex;

      ensureAudioContext();
      if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume().catch(err => console.warn(err));
      }

      state.audio.src = track.audioUrl;
      state.audio.load();
      emit('player:trackchange', { track });
      updateMediaSession(track);
      setMediaSessionState('playing');

      state.audio.play().catch((err) => {
        console.warn('[Player] Autoplay blocked:', err);
        setMediaSessionState('paused');
        emit('player:pause');
      });
    },

    /* ---- Pause ---- */
    pause() {
      state.playbackIntent = false;
      state.audio.pause();
      // State update happens via the 'pause' event listener above
    },

    /* ---- Resume (iOS-bulletproof) ---- */
    resume() {
      if (!state.currentTrack) return;
      state.playbackIntent = true;

      // Detect iOS/iPadOS — including iPad in desktop mode
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
        ('ontouchend' in document && /Mac/.test(navigator.userAgent));

      if (isIOS) {
        // iOS ALWAYS needs a full source reload to guarantee audible sound.
        // iOS Safari silently deallocates decoded audio frames in background.
        // readyState and networkState LIE — they still report "ready" even when
        // the audio buffer is empty. The ONLY reliable fix is to always reload.
        Player._reloadAndResume();
        return;
      }

      // Desktop / Android: normal resume
      ensureAudioContext();
      if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume().catch(() => {});
      }
      state.audio.play().then(() => {
        setMediaSessionState('playing');
      }).catch((err) => {
        console.warn('[Player] Resume failed:', err);
        setMediaSessionState('paused');
        emit('player:pause');
      });
    },

    /* ---- Internal: Reload src and resume from saved position (iOS fix) ---- */
    _reloadAndResume() {
      if (!state.currentTrack) return;
      const savedTime = state.audio.currentTime || 0;

      // Cancel any previous pending reload to prevent duplicate handlers
      if (state._pendingCanPlay) {
        state.audio.removeEventListener('canplay', state._pendingCanPlay);
        state._pendingCanPlay = null;
      }
      if (state._reloadTimeout) {
        clearTimeout(state._reloadTimeout);
        state._reloadTimeout = null;
      }

      state.audio.src = state.currentTrack.audioUrl;
      state.audio.load();

      state._pendingCanPlay = () => {
        state.audio.removeEventListener('canplay', state._pendingCanPlay);
        state._pendingCanPlay = null;
        if (state._reloadTimeout) {
          clearTimeout(state._reloadTimeout);
          state._reloadTimeout = null;
        }
        // Seek back to where the user was
        if (savedTime > 0 && state.audio.duration && savedTime < state.audio.duration) {
          state.audio.currentTime = savedTime;
        }
        state.audio.play().catch((err) => {
          console.error('[Player] Reload+play failed:', err);
          setMediaSessionState('paused');
          emit('player:pause');
        });
      };
      state.audio.addEventListener('canplay', state._pendingCanPlay);

      // Timeout fallback: if canplay never fires (e.g. network issue), try playing anyway
      state._reloadTimeout = setTimeout(() => {
        if (state._pendingCanPlay) {
          state.audio.removeEventListener('canplay', state._pendingCanPlay);
          state._pendingCanPlay = null;
          state._reloadTimeout = null;
          // Try playing even without canplay — sometimes iOS fires 'playing' directly
          state.audio.play().catch(() => {
            setMediaSessionState('paused');
            emit('player:pause');
          });
        }
      }, 4000);
    },

    /* ---- Toggle ---- */
    togglePlay() {
      // Read directly from audio.paused, never from a cached boolean
      if (state.audio && !state.audio.paused) {
        Player.pause();
      } else if (state.currentTrack) {
        Player.resume();
      } else if (state.queue.length) {
        Player.play(state.queue[0]);
        state.queueIndex = 0;
      } else if (window.UI) {
        window.UI.showToast('Choose a song to start playback.');
      }
    },

    /* ---- Queue management ---- */
    setQueue(tracks, startIndex = 0) {
      if (!tracks || !tracks.length) return;
      state.queue = [...tracks];
      state.queueIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
      emit('player:queuechange', { queue: state.queue });
      Player.play(state.queue[state.queueIndex]);
    },

    addToQueue(track) {
      if (!track) return;
      state.queue.push(track);
      emit('player:queuechange', { queue: state.queue });
    },

    removeFromQueue(index) {
      if (index < 0 || index >= state.queue.length) return;
      state.queue.splice(index, 1);
      if (index < state.queueIndex) state.queueIndex--;
      if (state.queueIndex >= state.queue.length) state.queueIndex = state.queue.length - 1;
      emit('player:queuechange', { queue: state.queue });
    },

    clearQueue() {
      state.queue = [];
      state.queueIndex = -1;
      emit('player:queuechange', { queue: [] });
    },

    /* ---- Navigation ---- */
    next() {
      if (!state.queue.length) return;
      if (state.queue.length === 1) {
        state.audio.currentTime = 0;
        if (!state.audio.paused) state.audio.play().catch(() => {});
        return;
      }

      if (state.isShuffle) {
        let nextIdx = Math.floor(Math.random() * state.queue.length);
        if (nextIdx === state.queueIndex) nextIdx = (nextIdx + 1) % state.queue.length;
        state.queueIndex = nextIdx;
      } else {
        state.queueIndex++;
        if (state.queueIndex >= state.queue.length) {
          if (state.repeatMode === 'all') {
            state.queueIndex = 0;
          } else {
            state.queueIndex = state.queue.length - 1;
            Player.pause();
            return;
          }
        }
      }
      Player.play(state.queue[state.queueIndex]);
    },

    previous() {
      if (!state.queue.length) return;

      if (state.audio.currentTime > 3) {
        state.audio.currentTime = 0;
        return;
      }
      if (state.queue.length === 1) {
        state.audio.currentTime = 0;
        if (!state.audio.paused) state.audio.play().catch(() => {});
        return;
      }

      state.queueIndex--;
      if (state.queueIndex < 0) {
        state.queueIndex = state.repeatMode === 'all' ? state.queue.length - 1 : 0;
      }
      Player.play(state.queue[state.queueIndex]);
    },

    /* ---- Shuffle & Repeat ---- */
    toggleShuffle() {
      state.isShuffle = !state.isShuffle;
      emit('player:shufflechange', { isShuffle: state.isShuffle });
    },

    cycleRepeat() {
      const modes = ['off', 'one', 'all'];
      const idx = modes.indexOf(state.repeatMode);
      state.repeatMode = modes[(idx + 1) % modes.length];
      emit('player:repeatchange', { repeatMode: state.repeatMode });
    },

    /* ---- Volume ---- */
    setVolume(val) {
      state.volume = Math.max(0, Math.min(1, val));
      state.audio.volume = state.volume;
      state.isMuted = state.volume === 0;
      localStorage.setItem('pulse_volume', state.volume);
      emit('player:volumechange', { volume: state.volume });
    },

    toggleMute() {
      if (state.isMuted) {
        Player.setVolume(state.previousVolume || 0.7);
        state.isMuted = false;
      } else {
        state.previousVolume = state.volume;
        Player.setVolume(0);
        state.isMuted = true;
      }
    },

    /* ---- Seek ---- */
    seek(percentage) {
      if (!state.audio.duration) return;
      state.audio.currentTime = (percentage / 100) * state.audio.duration;
    },

    seekBy(seconds) {
      if (!state.audio.duration) return;
      state.audio.currentTime = Math.max(0, Math.min(state.audio.duration, state.audio.currentTime + seconds));
    },

    /* ---- Progress info ---- */
    getProgress() {
      return {
        current: state.audio ? state.audio.currentTime : 0,
        total: state.audio ? (state.audio.duration || 0) : 0,
        percentage: state.audio && state.audio.duration
          ? (state.audio.currentTime / state.audio.duration) * 100
          : 0
      };
    },

    /* ---- Analyser data for visualizer ---- */
    getAnalyserData() {
      if (!state.analyser) return new Uint8Array(128);
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(data);
      return data;
    }
  };

  window.Player = Player;
})();
