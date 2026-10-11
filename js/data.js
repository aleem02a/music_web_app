/* ============================================================
   Pulse Music — data.js
   Music Catalog & Jamendo API Client
   ============================================================ */
(function () {
  'use strict';

  // ── Jamendo API config ──────────────────────────────────────
  const JAMENDO_BASE = 'https://api.jamendo.com/v3.0/';
  const CLIENT_ID = 'a93add10';

  // ── Helper: format seconds → mm:ss ──────────────────────────
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const s = Math.round(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Recently Played & Searched ────────────────────────────
  const getRecentlyPlayed = () => recentlyPlayed;
  const addRecentlyPlayed = (track) => {
    if (!track || !track.id) return;
    recentlyPlayed = recentlyPlayed.filter(t => t.id !== track.id);
    recentlyPlayed.unshift(track);
    if (recentlyPlayed.length > 20) recentlyPlayed.pop();
    try { localStorage.setItem(storageKey('recently_played'), JSON.stringify(recentlyPlayed)); notifyLibraryChanged(); } catch(e){}
  };

  const getRecentlySearched = () => recentlySearched;
  const addRecentlySearched = (item) => {
    if (!item || !item.id) return;
    recentlySearched = recentlySearched.filter(i => i.id !== item.id);
    recentlySearched.unshift(item);
    if (recentlySearched.length > 20) recentlySearched.pop();
    try { localStorage.setItem(storageKey('recently_searched'), JSON.stringify(recentlySearched)); notifyLibraryChanged(); } catch(e){}
  };

  // ── Demo Artists ────────────────────────────────────────────
  const artists = [
    { id: 'artist-1', name: 'Luna Echo', imageUrl: 'https://picsum.photos/seed/lunaecho/300/300', bio: 'Ambient electronic artist crafting dreamy soundscapes.', genres: ['Ambient', 'Electronic'], source: 'local' },
    { id: 'artist-2', name: 'The Velvet Riots', imageUrl: 'https://picsum.photos/seed/velvetriots/300/300', bio: 'Indie rock band with a raw and energetic sound.', genres: ['Rock', 'Indie'], source: 'local' },
    { id: 'artist-3', name: 'DJ Prism', imageUrl: 'https://picsum.photos/seed/djprism/300/300', bio: 'Electronic DJ and producer known for euphoric drops.', genres: ['Electronic', 'House'], source: 'local' },
    { id: 'artist-4', name: 'Miles Monroe', imageUrl: 'https://picsum.photos/seed/milesmonroe/300/300', bio: 'Smooth jazz pianist with a modern flair.', genres: ['Jazz', 'Soul'], source: 'local' },
    { id: 'artist-5', name: 'Sable Grey', imageUrl: 'https://picsum.photos/seed/sablegrey/300/300', bio: 'Pop vocalist blending R&B with electronic textures.', genres: ['Pop', 'R&B'], source: 'local' },
    { id: 'artist-6', name: 'Kodiak Waves', imageUrl: 'https://picsum.photos/seed/kodiakwaves/300/300', bio: 'Lo-fi hip-hop producer creating chill study vibes.', genres: ['Lo-fi', 'Hip-Hop'], source: 'local' },
    { id: 'artist-7', name: 'Aria Strings', imageUrl: 'https://picsum.photos/seed/ariastrings/300/300', bio: 'Classical crossover ensemble bringing orchestral beauty to modern ears.', genres: ['Classical', 'Cinematic'], source: 'local' },
    { id: 'artist-8', name: 'Neon Dusk', imageUrl: 'https://picsum.photos/seed/neondusk/300/300', bio: 'Synthwave artist inspired by 80s retro futurism.', genres: ['Synthwave', 'Electronic'], source: 'local' },
    { id: 'artist-9', name: 'Ember Skye', imageUrl: 'https://picsum.photos/seed/emberskye/300/300', bio: 'Alternative singer-songwriter with hauntingly beautiful vocals.', genres: ['Alternative', 'Folk'], source: 'local' },
    { id: 'artist-10', name: 'Circuit Breaker', imageUrl: 'https://picsum.photos/seed/circuitbreaker/300/300', bio: 'Hard-hitting EDM producer pushing boundaries.', genres: ['EDM', 'Dubstep'], source: 'local' }
  ];

  // ── Demo Tracks (real Jamendo IDs) ──────────────────────────
  const tracks = [
    { id: 't-1884527', title: 'Midnight Drive', artist: 'Luna Echo', artistId: 'artist-1', album: 'Dreamscapes', albumId: 'album-1', duration: 234, coverUrl: 'https://picsum.photos/seed/dreamscapes/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884527/mp32/', source: 'jamendo', genre: 'Ambient' },
    { id: 't-1884528', title: 'Floating Gardens', artist: 'Luna Echo', artistId: 'artist-1', album: 'Dreamscapes', albumId: 'album-1', duration: 198, coverUrl: 'https://picsum.photos/seed/dreamscapes/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884528/mp32/', source: 'jamendo', genre: 'Ambient' },
    { id: 't-1884529', title: 'Neon Rain', artist: 'Luna Echo', artistId: 'artist-1', album: 'Dreamscapes', albumId: 'album-1', duration: 267, coverUrl: 'https://picsum.photos/seed/dreamscapes/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884529/mp32/', source: 'jamendo', genre: 'Electronic' },
    { id: 't-1884530', title: 'Starlight Corridor', artist: 'Luna Echo', artistId: 'artist-1', album: 'Dreamscapes', albumId: 'album-1', duration: 312, coverUrl: 'https://picsum.photos/seed/dreamscapes/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884530/mp32/', source: 'jamendo', genre: 'Ambient' },
    { id: 't-1884531', title: 'Riot Season', artist: 'The Velvet Riots', artistId: 'artist-2', album: 'Breaking Static', albumId: 'album-2', duration: 245, coverUrl: 'https://picsum.photos/seed/breakingstatic/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884531/mp32/', source: 'jamendo', genre: 'Rock' },
    { id: 't-1884532', title: 'Glass Ceiling', artist: 'The Velvet Riots', artistId: 'artist-2', album: 'Breaking Static', albumId: 'album-2', duration: 210, coverUrl: 'https://picsum.photos/seed/breakingstatic/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884532/mp32/', source: 'jamendo', genre: 'Rock' },
    { id: 't-1884533', title: 'Electric Sermon', artist: 'The Velvet Riots', artistId: 'artist-2', album: 'Breaking Static', albumId: 'album-2', duration: 278, coverUrl: 'https://picsum.photos/seed/breakingstatic/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884533/mp32/', source: 'jamendo', genre: 'Rock' },
    { id: 't-1884534', title: 'Euphoria State', artist: 'DJ Prism', artistId: 'artist-3', album: 'Prism Drops', albumId: 'album-3', duration: 340, coverUrl: 'https://picsum.photos/seed/prismdrops/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884534/mp32/', source: 'jamendo', genre: 'Electronic' },
    { id: 't-1884535', title: 'Pulse Wave', artist: 'DJ Prism', artistId: 'artist-3', album: 'Prism Drops', albumId: 'album-3', duration: 295, coverUrl: 'https://picsum.photos/seed/prismdrops/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884535/mp32/', source: 'jamendo', genre: 'House' },
    { id: 't-1884536', title: 'Crystal Rain', artist: 'DJ Prism', artistId: 'artist-3', album: 'Prism Drops', albumId: 'album-3', duration: 318, coverUrl: 'https://picsum.photos/seed/prismdrops/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884536/mp32/', source: 'jamendo', genre: 'Electronic' },
    { id: 't-1884537', title: 'Blue in Green', artist: 'Miles Monroe', artistId: 'artist-4', album: 'Late Night Sessions', albumId: 'album-4', duration: 286, coverUrl: 'https://picsum.photos/seed/latenightsessions/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884537/mp32/', source: 'jamendo', genre: 'Jazz' },
    { id: 't-1884538', title: 'Velvet Keys', artist: 'Miles Monroe', artistId: 'artist-4', album: 'Late Night Sessions', albumId: 'album-4', duration: 253, coverUrl: 'https://picsum.photos/seed/latenightsessions/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884538/mp32/', source: 'jamendo', genre: 'Jazz' },
    { id: 't-1884539', title: 'Afterglow', artist: 'Sable Grey', artistId: 'artist-5', album: 'Luminous', albumId: 'album-5', duration: 225, coverUrl: 'https://picsum.photos/seed/luminous/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884539/mp32/', source: 'jamendo', genre: 'Pop' },
    { id: 't-1884540', title: 'Silk & Honey', artist: 'Sable Grey', artistId: 'artist-5', album: 'Luminous', albumId: 'album-5', duration: 199, coverUrl: 'https://picsum.photos/seed/luminous/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884540/mp32/', source: 'jamendo', genre: 'R&B' },
    { id: 't-1884541', title: 'Golden Hour', artist: 'Sable Grey', artistId: 'artist-5', album: 'Luminous', albumId: 'album-5', duration: 242, coverUrl: 'https://picsum.photos/seed/luminous/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884541/mp32/', source: 'jamendo', genre: 'Pop' },
    { id: 't-1884542', title: 'Rainy Afternoon', artist: 'Kodiak Waves', artistId: 'artist-6', album: 'Study Beats Vol. 1', albumId: 'album-6', duration: 178, coverUrl: 'https://picsum.photos/seed/studybeats/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884542/mp32/', source: 'jamendo', genre: 'Lo-fi' },
    { id: 't-1884543', title: 'Paper Planes', artist: 'Kodiak Waves', artistId: 'artist-6', album: 'Study Beats Vol. 1', albumId: 'album-6', duration: 163, coverUrl: 'https://picsum.photos/seed/studybeats/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884543/mp32/', source: 'jamendo', genre: 'Lo-fi' },
    { id: 't-1884544', title: 'Adagio in Twilight', artist: 'Aria Strings', artistId: 'artist-7', album: 'Orchestral Dreams', albumId: 'album-7', duration: 356, coverUrl: 'https://picsum.photos/seed/orchestraldreams/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884544/mp32/', source: 'jamendo', genre: 'Classical' },
    { id: 't-1884545', title: 'Cyber Sunset', artist: 'Neon Dusk', artistId: 'artist-8', album: 'Retro Future', albumId: 'album-8', duration: 289, coverUrl: 'https://picsum.photos/seed/retrofuture/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884545/mp32/', source: 'jamendo', genre: 'Synthwave' },
    { id: 't-1884546', title: 'Chrome Horizon', artist: 'Neon Dusk', artistId: 'artist-8', album: 'Retro Future', albumId: 'album-8', duration: 304, coverUrl: 'https://picsum.photos/seed/retrofuture/300/300', audioUrl: 'https://mp3d.jamendo.com/download/track/1884546/mp32/', source: 'jamendo', genre: 'Synthwave' }
  ];

  // ── Demo Albums ─────────────────────────────────────────────
  const albums = [
    { id: 'album-1', title: 'Dreamscapes', artist: 'Luna Echo', artistId: 'artist-1', coverUrl: 'https://picsum.photos/seed/dreamscapes/300/300', tracks: tracks.filter(t => t.albumId === 'album-1'), year: 2025, source: 'jamendo' },
    { id: 'album-2', title: 'Breaking Static', artist: 'The Velvet Riots', artistId: 'artist-2', coverUrl: 'https://picsum.photos/seed/breakingstatic/300/300', tracks: tracks.filter(t => t.albumId === 'album-2'), year: 2024, source: 'jamendo' },
    { id: 'album-3', title: 'Prism Drops', artist: 'DJ Prism', artistId: 'artist-3', coverUrl: 'https://picsum.photos/seed/prismdrops/300/300', tracks: tracks.filter(t => t.albumId === 'album-3'), year: 2025, source: 'jamendo' },
    { id: 'album-4', title: 'Late Night Sessions', artist: 'Miles Monroe', artistId: 'artist-4', coverUrl: 'https://picsum.photos/seed/latenightsessions/300/300', tracks: tracks.filter(t => t.albumId === 'album-4'), year: 2024, source: 'jamendo' },
    { id: 'album-5', title: 'Luminous', artist: 'Sable Grey', artistId: 'artist-5', coverUrl: 'https://picsum.photos/seed/luminous/300/300', tracks: tracks.filter(t => t.albumId === 'album-5'), year: 2025, source: 'jamendo' },
    { id: 'album-6', title: 'Study Beats Vol. 1', artist: 'Kodiak Waves', artistId: 'artist-6', coverUrl: 'https://picsum.photos/seed/studybeats/300/300', tracks: tracks.filter(t => t.albumId === 'album-6'), year: 2024, source: 'jamendo' },
    { id: 'album-7', title: 'Orchestral Dreams', artist: 'Aria Strings', artistId: 'artist-7', coverUrl: 'https://picsum.photos/seed/orchestraldreams/300/300', tracks: tracks.filter(t => t.albumId === 'album-7'), year: 2023, source: 'jamendo' },
    { id: 'album-8', title: 'Retro Future', artist: 'Neon Dusk', artistId: 'artist-8', coverUrl: 'https://picsum.photos/seed/retrofuture/300/300', tracks: tracks.filter(t => t.albumId === 'album-8'), year: 2025, source: 'jamendo' }
  ];

  // ── Curated Playlists ───────────────────────────────────────
  const playlists = [
    {
      id: 'playlist-chill', name: 'Chill Vibes', coverUrl: 'https://picsum.photos/seed/chillvibes/300/300',
      description: 'Relax and unwind with these mellow tracks.',
      tracks: [tracks[0], tracks[1], tracks[15], tracks[16], tracks[11]],
      isUserCreated: false, gradient: 'linear-gradient(135deg, #378ACB 0%, #8279E8 100%)'
    },
    {
      id: 'playlist-energy', name: 'High Energy', coverUrl: 'https://picsum.photos/seed/highenergy/300/300',
      description: 'Pump up your workout with these bangers.',
      tracks: [tracks[4], tracks[5], tracks[6], tracks[7], tracks[8]],
      isUserCreated: false, gradient: 'linear-gradient(135deg, #68b8ef 0%, #8279e8 100%)'
    },
    {
      id: 'playlist-focus', name: 'Deep Focus', coverUrl: 'https://picsum.photos/seed/deepfocus/300/300',
      description: 'Instrumental music for deep concentration.',
      tracks: [tracks[10], tracks[11], tracks[17], tracks[15], tracks[16]],
      isUserCreated: false, gradient: 'linear-gradient(135deg, #68B8EF 0%, #6878DF 100%)'
    },
    {
      id: 'playlist-night', name: 'Late Night Drive', coverUrl: 'https://picsum.photos/seed/latenightdrive/300/300',
      description: 'Synthwave and chill beats for the midnight road.',
      tracks: [tracks[0], tracks[18], tracks[19], tracks[3], tracks[9]],
      isUserCreated: false, gradient: 'linear-gradient(135deg, #142A3B 0%, #8279E8 100%)'
    },
    {
      id: 'playlist-discover', name: 'Discover Weekly', coverUrl: 'https://picsum.photos/seed/discoverweekly/300/300',
      description: 'A fresh mix of tracks curated just for you.',
      tracks: [tracks[12], tracks[13], tracks[14], tracks[2], tracks[7], tracks[18]],
      isUserCreated: false, gradient: 'linear-gradient(135deg, #68B8EF 0%, #172235 100%)'
    }
  ];

  // ── Local-tracks storage (augmented at runtime) ─────────────
  let localTracks = [];

  // ── Persistent state for Liked Songs & User Playlists ───────
  let likedSongs = [];
  let downloadedSongs = [];
  let userPlaylists = [];
  let recentlyPlayed = [];
  let recentlySearched = [];
  let activeUserId = null;

  const storageKey = (collection) => activeUserId
    ? `aurafy:${encodeURIComponent(activeUserId)}:${collection}`
    : `pulse_${collection}`;

  const lyricsCacheFingerprint = (text) => {
    let hash = 2166136261;
    for (let i = 0; i < String(text || '').length; i++) {
      hash ^= String(text).charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const getLyricsWordSync = (trackId, lyricsText) => {
    if (!trackId || !lyricsText) return null;
    try {
      const cache = JSON.parse(localStorage.getItem(storageKey('lyrics_word_sync_v1')) || '{}');
      const entry = cache[String(trackId)];
      return entry && entry.fingerprint === lyricsCacheFingerprint(lyricsText) && Array.isArray(entry.lines)
        ? entry.lines
        : null;
    } catch (_) { return null; }
  };

  const saveLyricsWordSync = (trackId, lyricsText, lines) => {
    if (!trackId || !lyricsText || !Array.isArray(lines)) return;
    try {
      const key = storageKey('lyrics_word_sync_v1');
      const cache = JSON.parse(localStorage.getItem(key) || '{}');
      cache[String(trackId)] = {
        fingerprint: lyricsCacheFingerprint(lyricsText),
        savedAt: Date.now(),
        lines: lines.map(line => ({
          text: String(line.text || ''),
          time: Number.isFinite(line.time) ? line.time : null,
          words: Array.isArray(line.words) ? line.words.map(word => ({
            text: String(word.text || ''),
            time: Number.isFinite(word.time) ? word.time : null,
            endTime: Number.isFinite(word.endTime) ? word.endTime : null
          })) : []
        }))
      };
      const entries = Object.entries(cache).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)).slice(0, 30);
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
    } catch (_) {}
  };

  const notifyLibraryChanged = () => {
    document.dispatchEvent(new CustomEvent('library:changed', { detail: { userId: activeUserId } }));
  };

  const loadStoredState = () => {
    try {
      const readArray = (collection) => {
        const raw = localStorage.getItem(storageKey(collection));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      };
      likedSongs = readArray('liked_songs');
      downloadedSongs = readArray('downloaded_songs');
      userPlaylists = readArray('user_playlists');
      recentlyPlayed = readArray('recently_played');
      recentlySearched = readArray('recently_searched');
    } catch (e) {
      console.warn('Error reading music library from localStorage', e);
      likedSongs = [];
      downloadedSongs = [];
      userPlaylists = [];
      recentlyPlayed = [];
      recentlySearched = [];
    }
  };
  loadStoredState();

  const saveLikedSongs = () => {
    try {
      localStorage.setItem(storageKey('liked_songs'), JSON.stringify(likedSongs));
      notifyLibraryChanged();
    } catch(e) {}
  };

  const saveDownloadedSongs = () => {
    try {
      const metadata = downloadedSongs.map(track => {
        const saved = { ...track };
        delete saved.downloadBlob;
        if (typeof saved.audioUrl === 'string' && saved.audioUrl.startsWith('blob:')) saved.audioUrl = '';
        return saved;
      });
      localStorage.setItem(storageKey('downloaded_songs'), JSON.stringify(metadata));
      notifyLibraryChanged();
    } catch(e) {}
  };

  const saveUserPlaylists = () => {
    try {
      localStorage.setItem(storageKey('user_playlists'), JSON.stringify(userPlaylists));
      notifyLibraryChanged();
    } catch(e) {}
  };

  // --- Saavn API Integration ---
  const SAAVN_BASE = '/api';
  const SAAVN_SEARCH_CACHE_TTL_MS = 45000;
  const saavnSearchCache = new Map();

  const getSaavnAudio = (song) => {
    const candidates = [];
    const addCandidate = (value, fallbackQuality = '') => {
      if (!value) return;
      const item = typeof value === 'string' ? { url: value, quality: fallbackQuality } : value;
      const url = item.url || item.link || item.media_url || item.downloadUrl;
      if (!url) return;
      const quality = String(item.quality || item.label || fallbackQuality || '');
      const bitrate = Number((quality.match(/\d{2,4}/) || [])[0]) || 0;
      candidates.push({ url, quality, bitrate });
    };

    // Some Saavn responses expose a list of bitrates; prefer the highest one.
    [song.downloadUrl, song.download_url, song.downloadUrls].forEach((collection) => {
      if (Array.isArray(collection)) collection.forEach((item) => addCandidate(item));
      else if (collection && typeof collection === 'object') Object.entries(collection).forEach(([quality, value]) => addCandidate(value, quality));
      else if (typeof collection === 'string') addCandidate(collection);
    });

    if (candidates.length) {
      candidates.sort((a, b) => b.bitrate - a.bitrate);
      const best = candidates[0];
      const bitrate = best.bitrate || Number((best.url.match(/(?:_|\b)(\d{2,4})(?:kbps)?(?:\.|\/)/i) || [])[1]) || 0;
      return { url: best.url, quality: bitrate ? `${bitrate} kbps` : best.quality };
    }

    const url = song.url || song.media_url || '';
    const has320 = song['320kbps'] === true || String(song['320kbps']).toLowerCase() === 'true';
    const urlBitrate = Number((url.match(/(?:_|\b)(\d{2,4})(?:kbps)?(?:\.|\/)/i) || [])[1]) || 0;
    const bitrate = has320 ? 320 : urlBitrate;
    return { url, quality: bitrate ? `${bitrate} kbps` : '' };
  };

  const mapSaavnTrack = (st) => {
    const audio = getSaavnAudio(st);
    return {
      id: `saavn-${st.id}`,
      title: st.title ? st.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : 'Unknown Title',
      artist: st.subtitle || st.artists || st.album_artist || 'Unknown Artist',
      artistId: st.artist_id ? `saavn-artist-${st.artist_id}` : '',
      album: st.album || '',
      albumId: st.album_id ? `saavn-album-${st.album_id}` : '',
      duration: Number(st.duration) || 0,
      coverUrl: st.image || 'https://picsum.photos/seed/default/300/300',
      audioUrl: audio.url,
      audioQuality: audio.quality,
      source: 'saavn',
      genre: st.language || 'Pop'
    };
  };

  const mapSaavnAlbum = (sa) => {
    const songsArray = sa.songs || sa.list || [];
    const albumId = sa.id || sa.albumid;
    const albumTracks = songsArray.map(mapSaavnTrack);
    return {
      id: `saavn-album-${albumId}`,
      title: sa.title ? sa.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : 'Unknown Album',
      artist: sa.primary_artists || sa.subtitle || 'Unknown Artist',
      artistId: '',
      coverUrl: sa.image || 'https://picsum.photos/seed/default/300/300',
      tracks: albumTracks,
      year: sa.year ? Number(sa.year) : 0,
      source: 'saavn'
    };
  };

  const saavnFetch = async (endpoint, options = {}) => {
    try {
      const res = await fetch(`${SAAVN_BASE}${endpoint}`, { signal: options.signal });
      if (!res.ok) throw new Error(`Saavn API error: ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      console.warn('[MusicData] Saavn fetch failed:', err);
      return null;
    }
  };

  const parseLyricsfileScalar = (raw) => {
    const value = String(raw || '').trim();
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1).replace(/''/g, "'");
    }
    if (value.startsWith('"') && value.endsWith('"')) {
      try { return JSON.parse(value); } catch (_) { return value.slice(1, -1); }
    }
    return value.replace(/\s+#.*$/, '').trim();
  };

  // LRCLIB returns Lyricsfile as YAML. Read only the simple lines/words
  // mapping we need, without pulling a YAML parser into the browser bundle.
  const parseLyricsfile = (source) => {
    if (typeof source !== 'string' || !source.trim()) return [];
    const lines = [];
    let currentLine = null;
    let currentWord = null;
    let inLines = false;
    let inWords = false;
    let lineIndent = null;
    let wordIndent = null;

    source.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw) => {
      const indent = (raw.match(/^[ \t]*/) || [''])[0].length;
      const text = raw.trim();
      if (!text || text.startsWith('#')) return;

      // Lyricsfile YAML is commonly emitted with list items flush-left
      // (`lines:\n- text: ...`), while hand-authored files may indent them.
      // Detect the actual list indentation instead of assuming either style.
      if (indent === 0 && /^[A-Za-z_][\w-]*\s*:/.test(text)) {
        inLines = /^lines\s*:\s*(?:#.*)?$/i.test(text);
        inWords = false;
        lineIndent = null;
        wordIndent = null;
        return;
      }
      if (!inLines) return;

      const sequenceText = raw.match(/^[ \t]*-\s+text:\s*(.*)$/);
      if (sequenceText) {
        if (lineIndent === null) lineIndent = indent;
        if (indent === lineIndent) {
          currentLine = { time: null, text: parseLyricsfileScalar(sequenceText[1]), words: [] };
          currentWord = null;
          wordIndent = null;
          inWords = false;
          lines.push(currentLine);
        } else if (currentLine && inWords && indent > lineIndent) {
          currentWord = { time: null, text: parseLyricsfileScalar(sequenceText[1]) };
          wordIndent = indent;
          currentLine.words.push(currentWord);
        }
        return;
      }
      if (!currentLine) return;

      if (indent > lineIndent && /^words\s*:\s*(?:#.*)?$/i.test(text)) {
        inWords = true;
        currentWord = null;
        wordIndent = null;
        return;
      }
      const timeValue = text.match(/^(start_ms|end_ms):\s*(-?\d+)\s*$/);
      if (!timeValue) return;
      const isWordField = inWords && currentWord && wordIndent !== null && indent >= wordIndent + 2;
      const target = isWordField ? currentWord : currentLine;
      if (!target) return;
      const seconds = Number(timeValue[2]) / 1000;
      if (timeValue[1] === 'start_ms') target.time = seconds;
      else target.endTime = seconds;
    });

    return lines
      .filter(line => line.text && Number.isFinite(line.time) && line.time >= 0)
      .map(line => ({
        ...line,
        words: line.words
          .filter(word => word.text && Number.isFinite(word.time) && word.time >= 0)
          .sort((a, b) => a.time - b.time)
      }))
      .sort((a, b) => a.time - b.time);
  };

  const normalizeLyricsMatch = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const artistMatchScore = (requested, candidate) => {
    const wanted = new Set(normalizeLyricsMatch(requested).split(' ').filter(Boolean));
    const found = new Set(normalizeLyricsMatch(candidate).split(' ').filter(Boolean));
    if (!wanted.size || !found.size) return 0;
    let overlap = 0;
    wanted.forEach(token => { if (found.has(token)) overlap += 1; });
    return overlap / Math.min(wanted.size, found.size);
  };

  const normalizeLyricsTitle = (value) => normalizeLyricsMatch(value)
    .replace(/\bfrom\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const hasLrcTimestamps = (lyrics) => /(?:^|\n)\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(String(lyrics || ''));
  const hasLrcWordTimestamps = (lyrics) => /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\][^\n]*<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/.test(String(lyrics || ''));

  const lyricsRecordToResult = (record) => {
    if (!record || record.instrumental) return { instrumental: true, lines: [], isSynced: false, hasWordSync: false };
    const timedLines = parseLyricsfile(record.lyricsfile);
    if (timedLines.length) {
      return { lines: timedLines, isSynced: true, hasWordSync: timedLines.some(line => line.words.length > 1), source: 'lrclib' };
    }
    if (record.syncedLyrics) return {
      lyrics: record.syncedLyrics,
      isSynced: hasLrcTimestamps(record.syncedLyrics),
      hasWordSync: hasLrcWordTimestamps(record.syncedLyrics),
      source: 'lrclib'
    };
    if (record.plainLyrics) return { lyrics: record.plainLyrics, source: 'lrclib' };
    return null;
  };

  // ── Public API ──────────────────────────────────────────────
  window.MusicData = {

    get activeUserId() { return activeUserId; },

    getLyricsWordSync,
    saveLyricsWordSync,

    setActiveUser: (userId) => {
      const nextUserId = userId || null;
      if (activeUserId === nextUserId) return;
      activeUserId = nextUserId;
      loadStoredState();
      document.dispatchEvent(new CustomEvent('library:profilechange', { detail: { userId: activeUserId } }));
    },

    exportUserLibrary: () => {
      const cleanTrack = (track) => {
        if (!track || track.source === 'local' || String(track.id || '').startsWith('local-')) return null;
        const clean = { ...track };
        delete clean.fileBlob;
        delete clean.coverBlob;
        delete clean.downloadBlob;
        if (typeof clean.audioUrl === 'string' && /^(blob:|data:)/i.test(clean.audioUrl)) clean.audioUrl = '';
        if (typeof clean.coverUrl === 'string' && /^(blob:|data:)/i.test(clean.coverUrl)) clean.coverUrl = '';
        return clean;
      };
      const cleanArray = (items) => items.map(cleanTrack).filter(Boolean);
      return {
        likedSongs: cleanArray(likedSongs),
        userPlaylists: userPlaylists.map(playlist => ({
          ...playlist,
          tracks: cleanArray(Array.isArray(playlist.tracks) ? playlist.tracks : [])
        })),
        recentlyPlayed: cleanArray(recentlyPlayed),
        recentlySearched: cleanArray(recentlySearched)
      };
    },

    mergeUserLibrary: (remote) => {
      if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return;
      const mergeById = (local, cloud) => {
        const merged = new Map();
        [...(Array.isArray(cloud) ? cloud : []), ...(Array.isArray(local) ? local : [])].forEach(item => {
          if (item && item.id) merged.set(item.id, { ...(merged.get(item.id) || {}), ...item });
        });
        return Array.from(merged.values());
      };
      likedSongs = mergeById(likedSongs, remote.likedSongs);
      recentlyPlayed = mergeById(recentlyPlayed, remote.recentlyPlayed).slice(0, 20);
      recentlySearched = mergeById(recentlySearched, remote.recentlySearched).slice(0, 20);

      const localPlaylists = userPlaylists;
      const mergedPlaylists = new Map();
      (Array.isArray(remote.userPlaylists) ? remote.userPlaylists : []).forEach(playlist => {
        if (playlist && playlist.id) mergedPlaylists.set(playlist.id, { ...playlist, tracks: Array.isArray(playlist.tracks) ? playlist.tracks : [] });
      });
      localPlaylists.forEach(playlist => {
        if (!playlist || !playlist.id) return;
        const previous = mergedPlaylists.get(playlist.id);
        const mergedTracks = mergeById(playlist.tracks, previous && previous.tracks);
        mergedPlaylists.set(playlist.id, { ...(previous || {}), ...playlist, tracks: mergedTracks });
      });
      userPlaylists = Array.from(mergedPlaylists.values());
      saveLikedSongs();
      saveUserPlaylists();
      try {
        localStorage.setItem(storageKey('recently_played'), JSON.stringify(recentlyPlayed));
        localStorage.setItem(storageKey('recently_searched'), JSON.stringify(recentlySearched));
      } catch (_) {}
    },

    /* ---- Local getters ---- */
    getAllTracks: () => [...tracks, ...localTracks],
    getPlaylists: () => [...playlists, ...userPlaylists],
    getUserPlaylists: () => [...userPlaylists],
    getAlbums: () => [...albums],
    getArtists: () => [...artists],

    getTrackById: (id) => [...tracks, ...localTracks].find(t => t.id === id) || null,
    getAlbumById: (id) => albums.find(a => a.id === id) || null,
    getArtistById: (id) => artists.find(a => a.id === id) || null,
    getPlaylistById: (id) => [...playlists, ...userPlaylists].find(p => p.id === id) || null,

    getTracksByArtistId: (artistId) => tracks.filter(t => t.artistId === artistId),
    getAlbumsByArtistId: (artistId) => albums.filter(a => a.artistId === artistId),

    searchLocal: (query) => {
      if (!query) return { tracks: [], albums: [], artists: [] };
      const q = query.toLowerCase();
      return {
        tracks: [...tracks, ...localTracks].filter(t =>
          t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q)
        ),
        albums: albums.filter(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)),
        artists: artists.filter(a => a.name.toLowerCase().includes(q))
      };
    },

    addLocalTrack: (track) => {
      localTracks.push(track);
    },
    getLocalTracks: () => [...localTracks],
    setLocalTracks: (t) => { localTracks = t; },

    /* ---- Liked Songs API ---- */
    getLikedSongs: () => [...likedSongs],
    isLiked: (trackId) => likedSongs.some(t => t.id === trackId),
    toggleLiked: (track) => {
      const idx = likedSongs.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        likedSongs.splice(idx, 1);
      } else {
        likedSongs.unshift(track);
      }
      saveLikedSongs();
      return idx < 0; // returns true if added, false if removed
    },

    /* ---- Downloaded Songs API ---- */
    getDownloadedSongs: () => [...downloadedSongs],
    isDownloaded: (trackId) => downloadedSongs.some(t => t.id === trackId),
    restoreDownloadedTrack: (track) => {
      if (!track || !track.id) return;
      const idx = downloadedSongs.findIndex(item => item.id === track.id);
      if (idx >= 0) downloadedSongs[idx] = { ...downloadedSongs[idx], ...track };
      else downloadedSongs.unshift(track);
      saveDownloadedSongs();
    },
    toggleDownloaded: (track) => {
      const idx = downloadedSongs.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        downloadedSongs.splice(idx, 1);
      } else {
        downloadedSongs.unshift(track);
      }
      saveDownloadedSongs();
      return idx < 0;
    },

    /* ---- User Playlists API ---- */
    createPlaylist: (name) => {
      const newPlaylist = {
        id: 'user-playlist-' + Date.now(),
        name: name,
        coverUrl: 'https://picsum.photos/seed/' + Math.random() + '/300/300',
        description: 'Created by you.',
        tracks: [],
        isUserCreated: true,
        gradient: 'linear-gradient(135deg, #378ACB 0%, #6878DF 100%)'
      };
      userPlaylists.unshift(newPlaylist);
      saveUserPlaylists();
      return newPlaylist;
    },
    addTrackToPlaylist: (playlistId, track) => {
      const p = userPlaylists.find(p => p.id === playlistId);
      if (p) {
        if (!p.tracks.some(t => t.id === track.id)) {
          p.tracks.push(track);
          saveUserPlaylists();
        }
      }
    },
    removeTrackFromPlaylist: (playlistId, trackId) => {
      const p = userPlaylists.find(p => p.id === playlistId);
      if (p) {
        p.tracks = p.tracks.filter(t => t.id !== trackId);
        saveUserPlaylists();
      }
    },
    renamePlaylist: (playlistId, newName) => {
      const p = userPlaylists.find(p => p.id === playlistId);
      if (p) {
        p.name = newName;
        saveUserPlaylists();
      }
    },
    deletePlaylist: (playlistId) => {
      const idx = userPlaylists.findIndex(p => p.id === playlistId);
      if (idx !== -1) {
        userPlaylists.splice(idx, 1);
        saveUserPlaylists();
        return true;
      }
      return false;
    },

    /* ---- Recently Played/Searched API ---- */
    getRecentlyPlayed,
    addRecentlyPlayed,
    getRecentlySearched,
    addRecentlySearched,

    /* ---- Saavn API ---- */
    searchSaavn: async (query, options = {}) => {
      const searchTerm = String(query || '').trim();
      if (!searchTerm) return { tracks: [], albums: [], artists: [] };
      const cacheKey = searchTerm.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
      const cached = saavnSearchCache.get(cacheKey);
      if (cached && Date.now() - cached.savedAt < SAAVN_SEARCH_CACHE_TTL_MS) return cached.results;
      if (cached) saavnSearchCache.delete(cacheKey);
      const resData = await saavnFetch(`/search/${encodeURIComponent(searchTerm)}`, options);
      if (!resData) return { tracks: [], albums: [], artists: [], unavailable: true };
      const results = (resData && resData.results) ? resData.results : (Array.isArray(resData) ? resData : []);
      if (!Array.isArray(results)) return { tracks: [], albums: [], artists: [] };
      
      const tracks = results.map(mapSaavnTrack);
      
      // Extract unique albums from tracks
      const albumsMap = new Map();
      results.forEach(st => {
        if (st.album_id && !albumsMap.has(st.album_id)) {
          albumsMap.set(st.album_id, {
            id: `saavn-album-${st.album_id}`,
            title: st.album || 'Unknown Album',
            artist: st.album_artist || st.artists || 'Unknown Artist',
            coverUrl: st.image || 'https://picsum.photos/seed/default/300/300',
            source: 'saavn'
          });
        }
      });
      const albums = Array.from(albumsMap.values());
      
      const searchResults = {
        tracks,
        albums,
        artists: [] // Artist extraction omitted for brevity
      };
      saavnSearchCache.set(cacheKey, { results: searchResults, savedAt: Date.now() });
      if (saavnSearchCache.size > 40) saavnSearchCache.delete(saavnSearchCache.keys().next().value);
      return searchResults;
    },

    getSaavnAlbum: async (albumId) => {
      const rawId = String(albumId).replace('saavn-album-', '');
      const albumData = await saavnFetch(`/album/${rawId}`);
      if (!albumData) return null;
      const mapped = mapSaavnAlbum(albumData);
      if (!albums.find(a => a.id === mapped.id)) {
        albums.push(mapped);
      }
      return mapped;
    },

    getSongLyrics: async (id, track, options = {}) => {
      const signal = options.signal;
      const title = String(track && track.title || '').trim();
      const artist = String(track && track.artist || '').trim();
      const album = String(track && track.album || '').trim();
      const duration = Math.round(Number(track && track.duration) || 0);
      const isLocalTrack = track && (track.source === 'local' || String(track.id || '').startsWith('local-'));
      let bestPlainLyrics = null;
      let bestLineSyncedLyrics = null;

      if (title && artist) {
        const params = new URLSearchParams({ track_name: title, artist_name: artist });
        if (album) params.set('album_name', album);
        if (duration >= 1 && duration <= 3600) params.set('duration', String(duration));
        let searchAllowed = true;

        // /api/get uses the complete signature (including duration when
        // available), so same-title songs are not casually mixed together.
        // A transient endpoint/network error should still allow the separate
        // search endpoint to return timed lyrics. Only back off on 429.
        try {
          const exactResponse = await fetch(`https://lrclib.net/api/get?${params}`, { signal });
          if (exactResponse.status === 429) searchAllowed = false;
          if (exactResponse.ok) {
            const exactRecord = await exactResponse.json();
            const exactResult = lyricsRecordToResult(exactRecord);
            if (exactResult && exactResult.instrumental) return exactResult;
            if (exactResult && exactResult.hasWordSync) return exactResult;
            if (exactResult && exactResult.isSynced) bestLineSyncedLyrics = exactResult;
            else if (exactResult) bestPlainLyrics = exactResult;
          }
        } catch (err) {
          if (err && err.name === 'AbortError') throw err;
          console.warn('LRCLIB exact lookup failed; trying its search endpoint.', err);
        }

        // Search alternatives when the strict signature has only plain or
        // line-synced lyrics; a matching word-timed record is more useful.
        const searchParams = new URLSearchParams({ track_name: title, artist_name: artist });
        if (album) searchParams.set('album_name', album);
        if (searchAllowed) {
          try {
            const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams}`, { signal });
            if (searchResponse.ok) {
              const records = await searchResponse.json();
              const normalizedTitle = normalizeLyricsTitle(title);
              const candidates = (Array.isArray(records) ? records : [])
                .map((record, index) => {
                  const candidateTitle = normalizeLyricsTitle(record.trackName || record.name);
                  const titleExact = candidateTitle === normalizedTitle;
                  const artistScore = artistMatchScore(artist, record.artistName);
                  const candidateDuration = Number(record.duration) || 0;
                  const durationDelta = duration && candidateDuration ? Math.abs(duration - candidateDuration) : 0;
                  const albumMatch = album && normalizeLyricsMatch(album) === normalizeLyricsMatch(record.albumName);
                  return { record, index, titleExact, artistScore, durationDelta, albumMatch: Boolean(albumMatch) };
                })
                .filter(item => item.titleExact && item.artistScore >= 0.5 && (!duration || !item.durationDelta || item.durationDelta <= 8))
                .sort((a, b) => Number(b.record.hasWordSync) - Number(a.record.hasWordSync) || Number(b.albumMatch) - Number(a.albumMatch) || a.durationDelta - b.durationDelta || b.artistScore - a.artistScore || a.index - b.index);
              for (const candidate of candidates) {
                const matchedResult = lyricsRecordToResult(candidate.record);
                if (matchedResult && matchedResult.instrumental) continue;
                if (matchedResult && matchedResult.hasWordSync) return matchedResult;
                if (matchedResult && matchedResult.isSynced && !bestLineSyncedLyrics) bestLineSyncedLyrics = matchedResult;
                else if (matchedResult && !bestPlainLyrics) bestPlainLyrics = matchedResult;
              }
            }
          } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            console.warn('LRCLIB search failed; trying the track lyrics source.', err);
          }
        }
        if (bestLineSyncedLyrics) return bestLineSyncedLyrics;
        if (bestPlainLyrics) return bestPlainLyrics;
      }

      // Local audio has no Saavn ID. For catalog tracks, keep the provider's
      // track-ID lookup as a text-only fallback when no timed match exists.
      if (isLocalTrack) return null;
      if (track && track.source && track.source !== 'saavn' && !String(id || '').startsWith('saavn-')) return null;
      const rawId = String(id || '').replace('saavn-', '');
      try {
        const data = await saavnFetch(`/lyrics/${encodeURIComponent(rawId)}`, { signal });
        if (data && data.lyrics) {
          return { lyrics: String(data.lyrics).replace(/<br\s*\/?\s*>/gi, '\n'), source: 'saavn' };
        }
        return null;
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        return null;
      }
    },

    romanizeToEnglish: async (text) => {
      if (!text) return '';
      try {
        const chunks = text.match(/[\s\S]{1,1000}(?=\n|$)/g) || [text];
        const results = [];
        for (let chunk of chunks) {
          if (!chunk.trim()) {
            results.push(chunk);
            continue;
          }
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=hi&tl=en&dt=rm&q=${encodeURIComponent(chunk)}`;
          const res = await fetch(url);
          const data = await res.json();
          let chunkText = '';
          if (data && data[0]) {
             for (let item of data[0]) {
                if (item[3]) chunkText += item[3];
                else if (item[0]) chunkText += item[0];
             }
          }
          results.push(chunkText || chunk);
        }
        return results.join('');
      } catch (err) {
        console.warn('Romanization failed:', err);
        throw err;
      }
    },

    getTrendingTracks: async () => {
      // Fetch some default popular hits for home screen
      const resData = await saavnFetch('/search/top hindi songs');
      const results = (resData && resData.results) ? resData.results : (Array.isArray(resData) ? resData : []);
      if (!Array.isArray(results)) return [];
      return results.map(mapSaavnTrack);
    },

    /* ---- Utility ---- */
    formatDuration,

    genres: ['Pop', 'Rock', 'Electronic', 'Jazz', 'Hip-Hop', 'Classical', 'Ambient', 'Lo-fi', 'R&B', 'Metal', 'Folk', 'Country', 'Reggae', 'Soul', 'Punk']
  };

})();
