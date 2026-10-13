/* ============================================================
   Pulse Music — app.js
   Application Controller, Router & Event Delegation
   ============================================================ */
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  let currentView = 'home';
  let searchDebounceTimer = null;
  let navigationGeneration = 0;
  let hasHydratedHome = false;
  let fullscreenReturnFocus = null;
  const DEBOUNCE_MS = 200;

  const setFullscreenOpen = (isOpen) => {
    const fs = document.querySelector('.fullscreen-player');
    if (!fs) return;
    const isCurrentlyOpen = fs.classList.contains('active');
    if (isOpen && !isCurrentlyOpen) fullscreenReturnFocus = document.activeElement;

    fs.classList.toggle('active', isOpen);
    fs.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      fs.removeAttribute('inert');
      fs.setAttribute('aria-modal', 'true');
      window.requestAnimationFrame(() => {
        if (!fs.classList.contains('active')) return;
        (fs.querySelector('.fs-player-close') || fs).focus();
      });
    } else {
      fs.setAttribute('inert', '');
      fs.removeAttribute('aria-modal');
      if (isCurrentlyOpen && fullscreenReturnFocus && fullscreenReturnFocus.isConnected) {
        fullscreenReturnFocus.focus();
      }
      fullscreenReturnFocus = null;
    }

    if (isOpen && window.Player && window.Player.currentTrack && window.UI) {
      window.UI.updatePlayerUI(window.Player.currentTrack);
    }
  };

  // Track the actually visible viewport: mobile browser chrome and the on-screen
  // keyboard can make the visual viewport shorter than the CSS layout viewport.
  let viewportSyncFrame = 0;
  const syncVisualViewportHeight = () => {
    if (viewportSyncFrame) return;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    viewportSyncFrame = schedule(() => {
      viewportSyncFrame = 0;
      const visibleHeight = window.visualViewport?.height || window.innerHeight;
      if (visibleHeight > 0) {
        document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(visibleHeight)}px`);
      }
    });
  };

  // ── Device Detection & View Transfer ─────────────────────────
  const updateViewMode = () => {
    const isTouchTablet = navigator.maxTouchPoints > 1 && window.innerWidth <= 1180;
    const isMobile = window.innerWidth <= 768 || isTouchTablet || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile-view-active');
        document.body.classList.remove('desktop-view-active');
    } else {
        document.body.classList.add('desktop-view-active');
        document.body.classList.remove('mobile-view-active');
    }
  };

  // Initialize view mode
  window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(updateViewMode, 100);
    syncVisualViewportHeight();
  });
  window.addEventListener('orientationchange', syncVisualViewportHeight);
  window.visualViewport?.addEventListener('resize', syncVisualViewportHeight);
  syncVisualViewportHeight();
  updateViewMode();
  document.addEventListener('DOMContentLoaded', updateViewMode);

  // ── Router ──────────────────────────────────────────────────
  const parseHash = () => {
    let rawHash = window.location.hash.replace('#', '') || 'home';

    // Handle Supabase OAuth callback tokens in hash
    if (rawHash.startsWith('access_token=') || rawHash.includes('&access_token=') || rawHash.startsWith('refresh_token=')) {
      return { view: 'account', id: '', query: '', isOAuthCallback: true };
    }
    if (rawHash.startsWith('error=') || rawHash.includes('&error=')) {
      return { view: 'login', id: '', query: '', isOAuthError: true };
    }

    const parts = rawHash.split('/');
    const view = parts[0].split('?')[0];
    const id = parts[1] || '';

    // Extract query param for search
    const qMatch = rawHash.match(/[?&]q=([^&]*)/);
    const query = qMatch ? decodeURIComponent(qMatch[1]) : '';

    return { view, id, query };
  };

  const navigate = (view, id = '', extra = {}) => {
    let hash = `#${view}`;
    if (id) hash += `/${id}`;
    if (extra.query) hash += `?q=${encodeURIComponent(extra.query)}`;
    window.location.hash = hash;
  };

  const renderView = () => {
    const { view, id, query } = parseHash();
    const contentBody = document.querySelector('.content-body');
    if (!contentBody) return;

    const isAuthPage = ['login', 'signup', 'account'].includes(view);
    document.body.classList.toggle('auth-page-active', isAuthPage);
    if (isAuthPage) {
      contentBody.scrollLeft = 0;
      document.querySelector('.app')?.scrollTo({ left: 0 });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    }

    const navBackBtn = document.getElementById('nav-back-btn');
    if (navBackBtn) {
      navBackBtn.style.display = view === 'home' ? 'none' : 'flex';
    }

    currentView = view;
    const viewGeneration = ++navigationGeneration;
    UI.setActiveNav(view);

    // Scroll to top
    contentBody.scrollTop = 0;
    
    // Add page transition class
    contentBody.classList.remove('content-loaded');
    void contentBody.offsetWidth; // trigger reflow
    contentBody.classList.add('content-loaded');

    switch (view) {
      case 'login':
      case 'signup':
      case 'account':
        contentBody.innerHTML = window.AuthManager ? window.AuthManager.renderPage(view) : '';
        break;
      case 'home':
        if (!hasHydratedHome) {
          contentBody.innerHTML = UI.renderHome({ homeLoading: true });
          window.setTimeout(() => {
            if (viewGeneration !== navigationGeneration || currentView !== 'home' || !contentBody.isConnected) return;
            hasHydratedHome = true;
            contentBody.innerHTML = UI.renderHome({ trendingLoading: true });
            loadTrendingAsync();
          }, 260);
        } else {
          contentBody.innerHTML = UI.renderHome({ trendingLoading: true });
          loadTrendingAsync();
        }
        break;
      case 'search':
        contentBody.innerHTML = UI.renderSearch(query);
        // Set search input value
        const searchInput = document.querySelector('.search-input');
        if (searchInput && query) searchInput.value = query;
        if (query) UI.loadSaavnSearch(query);
        break;
      case 'library':
        contentBody.innerHTML = UI.renderLibrary();
        if (window.activeSourceTab && window.applySourceFilter) {
          setTimeout(() => window.applySourceFilter(window.activeSourceTab), 0);
        }
        break;
      case 'liked':
        contentBody.innerHTML = UI.renderLikedSongs ? UI.renderLikedSongs() : '';
        break;
      case 'downloaded':
        contentBody.innerHTML = UI.renderDownloadedSongs ? UI.renderDownloadedSongs() : '';
        break;
      case 'playlist':
        contentBody.innerHTML = UI.renderPlaylist(id);
        break;
      case 'album':
        contentBody.innerHTML = UI.renderAlbum(id);
        if (id.startsWith('saavn-album-')) loadSaavnAlbumAsync(id, contentBody);
        break;
      case 'artist':
        contentBody.innerHTML = UI.renderArtist(id);
        // Artist proxy not available, gracefully ignore
        break;
      case 'queue':
        contentBody.innerHTML = UI.renderQueue();
        break;
      case 'ai-playlist':
        // Do not re-render the view, just open the modal.
        currentView = 'home';
        contentBody.innerHTML = UI.renderHome();
        const aiModal = document.getElementById('ai-playlist-modal');
        if (aiModal) aiModal.classList.remove('hidden');
        break;
      default:
        contentBody.innerHTML = UI.renderHome();
    }
  };

  // ── Async loaders for Saavn content ────────────────────────
  let trendingLoadGeneration = 0;
  const loadTrendingAsync = async () => {
    const generation = ++trendingLoadGeneration;
    const container = document.querySelector('.trending-grid');
    if (!container) return;

    const renderCards = (cardsHtml) => {
      if (generation !== trendingLoadGeneration || !container.isConnected) return;
      container.setAttribute('aria-busy', 'false');
      container.innerHTML = cardsHtml
        ? `<div class="content-loaded" style="display:contents">${cardsHtml}</div>`
        : '<p class="trending-empty-state">Trending music is unavailable right now.</p>';
    };

    try {
      const trendingTracks = await MusicData.getTrendingTracks();
      if (trendingTracks.length > 0) {
        renderCards(trendingTracks.slice(0, 6).map(t => UI.createCard(t, 'track')).join(''));
      } else {
        const fallbackAlbums = MusicData.getAlbums().slice(0, 6);
        renderCards(fallbackAlbums.map(album => UI.createCard(album, 'album')).join(''));
      }
    } catch (err) {
      console.warn('Failed to load trending:', err);
      const fallbackAlbums = MusicData.getAlbums().slice(0, 6);
      renderCards(fallbackAlbums.map(album => UI.createCard(album, 'album')).join(''));
    }
  };

  const loadSaavnAlbumAsync = async (albumId, container) => {
    try {
      // Show album skeleton loading while fetching
      container.innerHTML = UI.renderAlbumSkeleton();
      
      const album = await MusicData.getSaavnAlbum(albumId);
      if (album) {
        // Wrap content in content-loaded class for fade-in animation
        const albumHtml = UI.renderAlbum(album.id);
        container.innerHTML = `<div class="content-loaded">${albumHtml}</div>`;
        const trackList = container.querySelector('.track-list');
        if (trackList) {
           trackList.innerHTML = album.tracks.map((t, i) => UI.createTrackRow(t, i, { showAlbum: false })).join('');
        }
      }
    } catch (err) {
      console.warn('[App] Failed to load Saavn album:', err);
      container.innerHTML = `<div class="empty-state"><p>Failed to load album</p><p class="empty-hint">Please try again later</p></div>`;
    }
  };

  // ── Get tracks for a collection (for play-collection) ───────
  const getCollectionTracks = async (type, id) => {
    if (type === 'liked') return MusicData.getLikedSongs();
    if (type === 'downloaded') return MusicData.getDownloadedSongs();
    if (type === 'playlist') {
      const pl = MusicData.getPlaylistById(id);
      return pl ? pl.tracks : [];
    }
    if (type === 'album') {
      let al = MusicData.getAlbumById(id);
      if (!al && id.startsWith('saavn-album-')) {
        al = await MusicData.getSaavnAlbum(id);
      }
      return al ? al.tracks : [];
    }
    return [];
  };

  const resolveTrack = (id, el = null) => {
    let t = MusicData.getTrackById(id) || MusicData.getAllTracks().find(t => t.id === id);
    if (!t && el) {
      const dataEl = el.closest('[data-track], [data-item]');
      if (dataEl) {
        const trackData = dataEl.dataset.track || dataEl.dataset.item;
        if (trackData) {
          try {
            t = JSON.parse(trackData);
          } catch(e) {
            console.error('Failed to parse track data', e);
          }
        }
      }
    }
    return t;
  };

  // ── Collect tracks visible in current track-list ────────────
  const collectVisibleTracks = (clickedRow) => {
    const trackList = clickedRow.closest('.track-list');
    if (!trackList) return [];
    const rows = trackList.querySelectorAll('.track-row[data-track-id]');
    const tracksList = [];
    rows.forEach(r => {
      const t = resolveTrack(r.dataset.trackId, r);
      if (t) tracksList.push(t);
    });
    return tracksList;
  };

  // ── Event delegation: content body clicks ───────────────────
  const handleContentClick = async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    // Record selected items only from actual search results, not from recommendations or history.
    if (currentView === 'search' && target.closest('#search-results, #saavn-results-container') && window.MusicData && MusicData.addRecentlySearched) {
      const itemStr = target.dataset.item || target.dataset.track || target.closest('.card')?.dataset.item;
      if (itemStr) {
        try { 
          const parsed = JSON.parse(itemStr);
          parsed.type = parsed.type || (target.dataset.trackId ? 'track' : 'album');
          MusicData.addRecentlySearched(parsed); 
        } catch(e) {}
      }
    }

    switch (action) {
      case 'navigate': {
        const view = target.dataset.view;
        const id = target.dataset.id || '';
        e.preventDefault();
        e.stopPropagation();
        navigate(view, id);
        break;
      }

      case 'create-playlist': {
        const modal = document.getElementById('create-playlist-modal');
        const input = document.getElementById('create-playlist-input');
        if (modal && input) {
          input.value = '';
          modal.classList.remove('hidden');
          input.focus();
        }
        break;
      }

      case 'download-track': {
        const trackId = target.dataset.trackId;
        const track = resolveTrack(trackId, target);
        if (track) {
          try {
            const result = await LocalFiles.downloadTrack(track);
            if (window.UI) {
              const message = result.removed
                ? 'Removed from Aurafy Downloads. The device file stays on your device.'
                : result.deviceDownloadStarted
                  ? 'Device download started and saved in Aurafy Downloads.'
                  : 'Saved in Aurafy Downloads, but the device download could not start.';
              UI.showToast(message);
            }
            if (currentView === 'downloaded') renderView();
          } catch (error) {
            if (window.UI) UI.showToast(error.message || 'Could not save this track offline.');
          }
        }
        break;
      }

      case 'play-track': {
        const trackId = target.dataset.trackId;
        const track = resolveTrack(trackId, target);
        if (!track) break;

        const visibleTracks = collectVisibleTracks(target);
        if (visibleTracks.length > 0) {
          const idx = visibleTracks.findIndex(t => t.id === trackId);
          Player.setQueue(visibleTracks, idx >= 0 ? idx : 0);
        } else {
          const allTracks = MusicData.getAllTracks();
          const idx = allTracks.findIndex(t => t.id === trackId);
          if (idx >= 0) {
            Player.setQueue(allTracks, idx);
          } else {
            Player.setQueue([track], 0);
          }
        }
        break;
      }

      case 'toggle-playlist-menu': {
        const dropdown = target.nextElementSibling;
        if (dropdown && dropdown.classList.contains('playlist-more-dropdown')) {
          const isVisible = dropdown.style.display === 'block';
          dropdown.style.display = isVisible ? 'none' : 'block';
        }
        break;
      }

      case 'rename-playlist': {
        const id = target.dataset.id;
        const playlist = window.MusicData && MusicData.getPlaylistById(id);
        if (playlist) {
          const modal = document.getElementById('rename-playlist-modal');
          const input = document.getElementById('rename-playlist-input');
          const submitBtn = document.getElementById('rename-playlist-submit');
          if (modal && input && submitBtn) {
            input.value = playlist.name;
            submitBtn.dataset.playlistId = id;
            modal.classList.remove('hidden');
            input.focus();
          }
        }
        const dropdown = document.getElementById('playlist-more-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        break;
      }

      case 'delete-playlist': {
        const id = target.dataset.id;
        const modal = document.getElementById('delete-playlist-modal');
        const submitBtn = document.getElementById('delete-playlist-submit');
        if (modal && submitBtn) {
          submitBtn.dataset.playlistId = id;
          modal.classList.remove('hidden');
        }
        const dropdown = document.getElementById('playlist-more-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        break;
      }

      case 'play-collection': {
        const type = target.dataset.type;
        const id = target.dataset.id;
        const btnIcon = target.querySelector('svg');
        const oldIcon = btnIcon ? btnIcon.innerHTML : '';
        if (btnIcon) btnIcon.innerHTML = '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31 31" stroke-dashoffset="0"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle>';
        const tracks = await getCollectionTracks(type, id);
        if (tracks.length) Player.setQueue(tracks, 0);
        if (btnIcon) btnIcon.innerHTML = oldIcon;
        break;
      }

      case 'shuffle-collection': {
        const type = target.dataset.type;
        const id = target.dataset.id;
        const btnIcon = target.querySelector('svg');
        const oldIcon = btnIcon ? btnIcon.innerHTML : '';
        if (btnIcon) btnIcon.innerHTML = '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31 31" stroke-dashoffset="0"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle>';
        const tracks = await getCollectionTracks(type, id);
        if (tracks.length) {
          Player.setQueue(tracks, 0);
          if (!Player.isShuffle) Player.toggleShuffle();
        }
        if (btnIcon) btnIcon.innerHTML = oldIcon;
        break;
      }

      case 'play-artist': {
        const artistId = target.dataset.id;
        const artistTracks = MusicData.getTracksByArtistId(artistId);
        if (artistTracks.length) Player.setQueue(artistTracks, 0);
        break;
      }

      case 'play-album': {
        const albumId = target.dataset.id;
        let album = MusicData.getAlbumById(albumId);
        if (!album && albumId.startsWith('saavn-album-')) {
          album = await MusicData.getSaavnAlbum(albumId);
        }
        if (album && album.tracks && album.tracks.length > 0) {
          Player.setQueue(album.tracks, 0);
        } else if (window.UI) {
          UI.showToast("No playable tracks found in this album.");
        }
        break;
      }

      case 'play-playlist': {
        const playlistId = target.dataset.id;
        const playlist = MusicData.getPlaylistById(playlistId);
        if (playlist && playlist.tracks && playlist.tracks.length > 0) {
          Player.setQueue(playlist.tracks, 0);
        } else if (window.UI) {
          UI.showToast("No playable tracks found in this playlist.");
        }
        break;
      }

      case 'browse-genre': {
        const genre = target.dataset.genre;
        navigate('search', '', { query: genre });
        break;
      }

      case 'track-menu': {
        const trackId = target.dataset.trackId;
        const row = target.closest('.track-row');
        const track = resolveTrack(trackId, row);
        if (track) UI.showContextMenu(e, track);
        break;
      }

      case 'import-files': {
        const input = target.tagName === 'INPUT' ? target : target.querySelector('input[type="file"]');
        if (input && input.files && input.files.length) {
          LocalFiles.handleFiles(input.files);
        }
        break;
      }
    }
  };

  // ── Source tab switching globally ────────────────────────────
  window.activeSourceTab = 'all';

  window.applySourceFilter = (source) => {
    // Update all tabs visually
    document.querySelectorAll('.source-tab').forEach(t => {
      const isActive = t.dataset.source === source;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-pressed', String(isActive));
    });

    const contentBody = document.querySelector('.content-body');
    if (!contentBody) return;
    
    // Only apply in library view sections
    const sections = contentBody.querySelectorAll('.section[data-source-section]');
    sections.forEach(sec => {
      const shouldShow = source === 'all' || sec.dataset.sourceSection === source;
      if (shouldShow) {
        sec.style.display = 'block';
        sec.classList.remove('source-section-enter');
        void sec.offsetWidth;
        sec.classList.add('source-section-enter');
      } else {
        sec.style.display = 'none';
        sec.classList.remove('source-section-enter');
      }
    });

    // Special case for local files empty state:
    const emptyState = contentBody.querySelector('.empty-state-local');
    if (emptyState) {
      const hasLocalFiles = LocalFiles.getTracks().length > 0;
      if (source === 'local' && !hasLocalFiles) {
        emptyState.style.display = 'flex';
        contentBody.querySelectorAll('.section[data-source-section="local"]').forEach(s => s.style.display = 'none');
      } else {
        emptyState.style.display = 'none';
      }
    }
  };

  const handleSourceTab = (e) => {
    const tab = e.target.closest('.source-tab');
    if (!tab) return;
    
    const source = tab.dataset.source;
    window.activeSourceTab = source;
    
    // Check if we are outside the library view, navigate to library
    const isLibrary = window.location.hash === '#library' || window.location.hash === '';
    if (!isLibrary) {
      window.location.hash = '#library';
      return; // hashchange will re-render and apply the filter
    }

    window.applySourceFilter(source);
  };

  // ── Player bar controls ─────────────────────────────────────
  const setupPlayerControls = () => {
    // Main play/pause
    document.addEventListener('click', (e) => {
      const mainBtn = e.target.closest('.player-btn-main');
      if (mainBtn) { Player.togglePlay(); return; }

      const playerBtn = e.target.closest('.player-btn[data-action]');
      if (playerBtn) {
        const action = playerBtn.dataset.action;
        if (action === 'next') Player.next();
        else if (action === 'prev') Player.previous();
        else if (action === 'shuffle') {
          Player.toggleShuffle();
        }
        else if (action === 'repeat') {
          Player.cycleRepeat();
        }
        else if (action === 'fullscreen') {
          setFullscreenOpen(true);
        }
        else if (action === 'pip') {
          Player.openPictureInPicture();
        }
        else if (action === 'mute') {
          Player.toggleMute();
        }
        else if (action === 'queue') {
          setFullscreenOpen(false);
          navigate('queue');
        }
        else if (action === 'like') {
          if (!Player.currentTrack) return;
          const isNowLiked = MusicData.toggleLiked(Player.currentTrack);
          playerBtn.classList.toggle('active', isNowLiked);
          playerBtn.setAttribute('aria-pressed', String(isNowLiked));
          playerBtn.setAttribute('aria-label', isNowLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs');
          playerBtn.title = isNowLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs';
          if (window.UI) window.UI.showToast(isNowLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
        }
        return;
      }

      // Language toggle
      const langBtn = e.target.closest('.lang-btn');
      if (langBtn) {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        langBtn.classList.add('active');
        const lang = langBtn.id === 'lang-hin' ? 'hin' : 'eng';
        if (window.UI && window.UI.setLyricsLanguage) {
          UI.setLyricsLanguage(lang);
        }
      }

      // Player bar click on mobile → open fullscreen player
      if (document.body.classList.contains('mobile-view-active')) {
        const isClickableBtn = e.target.closest('.player-btn') || e.target.closest('.player-btn-main') || e.target.closest('.player-mini-progress') || e.target.closest('.progress-bar');
        if (!isClickableBtn && e.target.closest('.player-bar')) {
          setFullscreenOpen(true);
          return;
        }
      }

      // Close fullscreen player
      const fsClose = e.target.closest('.fs-close-btn');
      if (fsClose) {
        setFullscreenOpen(false);
        return;
      }
    });

    // Progress bar click/drag
    const progressBars = document.querySelectorAll('.progress-bar');
    progressBars.forEach(progressBar => {
      const seekFromEvent = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const clientX = e.clientX;
        const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        Player.seek(pct);
      };

      progressBar.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        progressBar.setPointerCapture(e.pointerId);
        progressBar.dataset.dragging = 'true';
        seekFromEvent(e);
      });
      progressBar.addEventListener('pointermove', (e) => {
        if (progressBar.dataset.dragging === 'true') seekFromEvent(e);
      });
      progressBar.addEventListener('pointerup', (e) => {
        progressBar.dataset.dragging = 'false';
        if (progressBar.hasPointerCapture(e.pointerId)) progressBar.releasePointerCapture(e.pointerId);
      });
      progressBar.addEventListener('pointercancel', () => {
        progressBar.dataset.dragging = 'false';
      });
    });

    // Volume bar click/drag
    const volumeBars = document.querySelectorAll('.volume-bar');
    volumeBars.forEach(volumeBar => {
      const setVolFromEvent = (e) => {
        const rect = volumeBar.getBoundingClientRect();
        const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        Player.setVolume(vol);
        UI.updateVolumeUI(vol);
      };

      volumeBar.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        volumeBar.setPointerCapture(e.pointerId);
        volumeBar.dataset.dragging = 'true';
        setVolFromEvent(e);
      });
      volumeBar.addEventListener('pointermove', (e) => {
        if (volumeBar.dataset.dragging === 'true') setVolFromEvent(e);
      });
      volumeBar.addEventListener('pointerup', (e) => {
        volumeBar.dataset.dragging = 'false';
        if (volumeBar.hasPointerCapture(e.pointerId)) volumeBar.releasePointerCapture(e.pointerId);
      });
      volumeBar.addEventListener('pointercancel', () => {
        volumeBar.dataset.dragging = 'false';
      });
    });

    // Removed wheel event hijacker to allow native vertical scrolling down the page
  };

  // ── Player event listeners ──────────────────────────────────
  const setupPlayerEvents = () => {
    document.addEventListener('player:trackchange', (e) => {
      UI.updatePlayerUI(e.detail.track);
    });

    document.addEventListener('player:timeupdate', (e) => {
      UI.updateProgress(e.detail.current, e.detail.total);
    });

    document.addEventListener('player:play', (e) => {
      UI.updatePlayPauseBtn();
      
      // Track recently played
      if (e.detail && e.detail.track && window.MusicData && MusicData.addRecentlyPlayed) {
        try { MusicData.addRecentlyPlayed(e.detail.track); } catch(err) {}
      }
    });

    document.addEventListener('player:pause', () => {
      UI.updatePlayPauseBtn();
    });

    document.addEventListener('player:volumechange', (e) => {
      UI.updateVolumeUI(e.detail.volume);
    });

    document.addEventListener('player:shufflechange', () => {
      UI.updatePlaybackModeUI();
    });

    document.addEventListener('player:repeatchange', () => {
      UI.updatePlaybackModeUI();
    });

    document.addEventListener('player:queuechange', () => {
      UI.updateTransportState();
      // Re-render queue view if currently on it
      if (currentView === 'queue') {
        const contentBody = document.querySelector('.content-body');
        if (contentBody) contentBody.innerHTML = UI.renderQueue();
      }
    });
  };

  // ── Search ──────────────────────────────────────────────────
  const setupSearch = () => {
    const searchInput = document.querySelector('.search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    const voiceBtn = document.getElementById('voice-search-btn');
    const searchClear = document.querySelector('.search-clear-btn');
    if (!searchInput) return;

    let searchRequestId = 0;
    let activeSearchController = null;
    let activeSuggestionIndex = -1;
    const searchResultCache = new Map();
    const SEARCH_CACHE_TTL_MS = 45000;
    const setDropdownOpen = (isOpen) => {
      if (searchDropdown) searchDropdown.classList.toggle('active', isOpen);
      searchInput.setAttribute('aria-expanded', String(isOpen));
      if (!isOpen) {
        activeSuggestionIndex = -1;
        searchInput.removeAttribute('aria-activedescendant');
        getSearchOptions().forEach(option => {
          option.classList.remove('is-active');
          option.setAttribute('aria-selected', 'false');
        });
      }
    };
    const getSearchOptions = () => searchDropdown
      ? Array.from(searchDropdown.querySelectorAll('[data-search-option="true"]'))
      : [];
    const showRecentSearches = () => {
      if (!searchDropdown || !window.UI || !UI.renderSearchDropdown) return;
      searchDropdown.innerHTML = UI.renderSearchDropdown(null, '');
      setDropdownOpen(true);
    };
    const setActiveSuggestion = (index) => {
      const options = getSearchOptions();
      if (!options.length) {
        activeSuggestionIndex = -1;
        searchInput.removeAttribute('aria-activedescendant');
        return;
      }
      activeSuggestionIndex = (index + options.length) % options.length;
      options.forEach((option, optionIndex) => {
        const isActive = optionIndex === activeSuggestionIndex;
        option.classList.toggle('is-active', isActive);
        option.setAttribute('aria-selected', String(isActive));
      });
      const activeOption = options[activeSuggestionIndex];
      searchInput.setAttribute('aria-activedescendant', activeOption.id);
      activeOption.scrollIntoView({ block: 'nearest' });
    };
    const cancelSearch = () => {
      clearTimeout(searchDebounceTimer);
      searchRequestId += 1;
      activeSuggestionIndex = -1;
      if (activeSearchController) activeSearchController.abort();
      activeSearchController = null;
    };

    // Set initial state of search clear button
    if (searchClear) {
      searchClear.style.display = searchInput.value.trim() ? 'flex' : 'none';
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const q = searchInput.value.trim();
      const requestId = ++searchRequestId;
      activeSuggestionIndex = -1;
      if (activeSearchController) activeSearchController.abort();
      activeSearchController = null;

      if (searchClear) searchClear.style.display = q ? 'flex' : 'none';
      if (!searchDropdown) return;
      if (!q) {
        if (document.activeElement === searchInput) showRecentSearches();
        else {
          searchDropdown.innerHTML = '';
          setDropdownOpen(false);
        }
        return;
      }
      if (q.length < 2) {
        searchDropdown.innerHTML = '<div class="search-dropdown-status">Type at least 2 letters to see close matches.</div>';
        setDropdownOpen(true);
        return;
      }

      const cacheKey = q.normalize('NFKC').toLocaleLowerCase();
      const cached = searchResultCache.get(cacheKey);
      if (cached && Date.now() - cached.savedAt < SEARCH_CACHE_TTL_MS) {
        searchDropdown.innerHTML = UI.renderSearchDropdown(cached.results, q);
        setDropdownOpen(true);
        return;
      }
      if (cached) searchResultCache.delete(cacheKey);

      searchDropdown.innerHTML = '<div class="search-dropdown-loading">' + UI.renderSearchDropdownLoading() + '</div>';
      setDropdownOpen(true);
      searchDebounceTimer = setTimeout(async () => {
        const controller = new AbortController();
        activeSearchController = controller;
        try {
          const results = await MusicData.searchSaavn(q, { signal: controller.signal });
          if (requestId !== searchRequestId || searchInput.value.trim() !== q) return;
          activeSearchController = null;
          if (results && !results.unavailable) {
            searchResultCache.set(cacheKey, { results, savedAt: Date.now() });
            if (searchResultCache.size > 30) searchResultCache.delete(searchResultCache.keys().next().value);
          }
          searchDropdown.innerHTML = UI.renderSearchDropdown(results, q);
          setDropdownOpen(true);
        } catch (error) {
          if (requestId !== searchRequestId || (error && error.name === 'AbortError')) return;
          activeSearchController = null;
          searchDropdown.innerHTML = '<div class="search-dropdown-status">Could not load matches. Press Enter to search all results.</div>';
          setDropdownOpen(true);
        }
      }, DEBOUNCE_MS);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const options = getSearchOptions();
        if (searchDropdown && searchDropdown.classList.contains('active') && options.length) {
          e.preventDefault();
          const direction = e.key === 'ArrowDown' ? 1 : -1;
          setActiveSuggestion(activeSuggestionIndex < 0
            ? (direction > 0 ? 0 : options.length - 1)
            : activeSuggestionIndex + direction);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex >= 0) {
          const activeOption = getSearchOptions()[activeSuggestionIndex];
          if (activeOption) {
            activeOption.click();
            return;
          }
        }
        const q = searchInput.value.trim();
        cancelSearch();
        setDropdownOpen(false);
        if (q) navigate('search', '', { query: q });
        else navigate('search');
        searchInput.blur();
      } else if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim() && searchDropdown && searchDropdown.innerHTML) {
        setDropdownOpen(true);
      } else if (!searchInput.value.trim()) {
        showRecentSearches();
      }
    });

    searchInput.addEventListener('click', () => {
      if (!searchInput.value.trim() && searchDropdown && !searchDropdown.classList.contains('active')) {
        showRecentSearches();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container') && searchDropdown) {
        setDropdownOpen(false);
      }
    });

    if (searchDropdown) {
      searchDropdown.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        
        // Track recently searched item
        const itemStr = target.dataset.item || target.dataset.track;
        if (itemStr && window.MusicData && MusicData.addRecentlySearched) {
          try {
            const searchedItem = JSON.parse(itemStr);
            searchedItem.type = searchedItem.type || (target.dataset.trackId ? 'track' : 'album');
            MusicData.addRecentlySearched(searchedItem);
          } catch(e) {}
        }
        
        if (action === 'navigate') {
          const view = target.dataset.view;
          const id = target.dataset.id || '';
          setDropdownOpen(false);
          searchInput.value = '';
          navigate(view, id);
        } else if (action === 'play-track') {
          const trackId = target.dataset.trackId;
          const track = resolveTrack(trackId, target);
          if (track) {
            Player.setQueue([track], 0);
          }
          setDropdownOpen(false);
        } else if (action === 'play-track-data') {
          const trackDataStr = target.dataset.track;
          if (trackDataStr) {
             const trackData = JSON.parse(trackDataStr);
             Player.setQueue([trackData], 0);
          }
          setDropdownOpen(false);
        } else if (action === 'search-all') {
          const q = searchInput.value.trim();
          setDropdownOpen(false);
          if (q) navigate('search', '', { query: q });
          searchInput.blur();
        }
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        cancelSearch();
        searchInput.value = '';
        searchClear.style.display = 'none'; // Hide when cleared
        showRecentSearches();
        if (currentView === 'search') navigate('search');
        searchInput.focus();
      });
    }

    if (voiceBtn) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        voiceBtn.style.display = 'none';
      } else {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          voiceBtn.classList.add('listening');
          searchInput.placeholder = "Listening...";
        };

        recognition.onresult = async (event) => {
          const transcript = event.results[0][0].transcript;

          if (!window.AIService) {
            window.UI.showToast('AI service is not available.');
            return;
          } else {
            searchInput.placeholder = "AI is thinking...";
            try {
              const intent = await window.AIService.parseVoiceIntent(transcript);
              if (intent && intent.type === 'search' && typeof intent.query === 'string') {
                searchInput.value = intent.query.slice(0, 200);
                searchInput.dispatchEvent(new Event('input'));
              } else if (intent && intent.type === 'playlist' && typeof intent.query === 'string') {
                const aiTrigger = document.querySelector('.js-ai-playlist-trigger');
                if (aiTrigger) aiTrigger.click();
                const aiInput = document.getElementById('ai-playlist-input');
                if (aiInput) aiInput.value = intent.query.slice(0, 500);
              } else {
                searchInput.value = transcript.slice(0, 200);
                searchInput.dispatchEvent(new Event('input'));
              }
            } catch (err) {
              console.error("AI Error:", err);
              searchInput.value = transcript;
              searchInput.dispatchEvent(new Event('input'));
            }
            voiceBtn.classList.remove('listening');
            searchInput.placeholder = "What do you want to listen to?";
          }
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error", event.error);
          searchInput.placeholder = "What do you want to listen to?";
          voiceBtn.classList.remove('listening');
        };

        recognition.onend = () => {
          voiceBtn.classList.remove('listening');
          searchInput.placeholder = "What do you want to listen to?";
        };

        voiceBtn.addEventListener('click', () => {
          try {
            recognition.start();
          } catch (e) {
             // already started
          }
        });
      }
    }
  };

  // ── Sidebar nav ─────────────────────────────────────────────
  const setupNav = () => {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(item.dataset.view);
      });
    });

    // Mobile bottom nav
    document.querySelectorAll('.mobile-nav-item[data-view]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(item.dataset.view);
      });
    });

    // Create playlist action
    // Create playlist action via sidebar is now handled directly by clicking the link which triggers the global listener since we can just assign data-action="create-playlist" to it.
    document.querySelectorAll('.sidebar-nav-item[data-action="create-playlist"], .mobile-nav-item[data-action="create-playlist"]').forEach((createPlBtn) => {
      createPlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = document.getElementById('create-playlist-modal');
        const input = document.getElementById('create-playlist-input');
        if (modal && input) {
          input.value = '';
          modal.classList.remove('hidden');
          input.focus();
        }
      });
    });

    // Header navigation (removed nav arrows)
    
    const navBackBtn = document.getElementById('nav-back-btn');
    if (navBackBtn) {
      navBackBtn.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.hash = '#home';
        }
      });
    }
  };

  // ── Keyboard shortcuts ──────────────────────────────────────
  const setupKeyboard = () => {
    document.addEventListener('keydown', (e) => {
      const fullscreenPlayer = document.querySelector('.fullscreen-player.active');
      if (e.key === 'Escape' && fullscreenPlayer) {
        e.preventDefault();
        setFullscreenOpen(false);
        return;
      }

      if (e.key === 'Tab' && fullscreenPlayer) {
        const focusable = Array.from(fullscreenPlayer.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => !element.hidden && element.getClientRects().length > 0);
        if (!focusable.length) {
          e.preventDefault();
          fullscreenPlayer.querySelector('.fs-player-close')?.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !fullscreenPlayer.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !fullscreenPlayer.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      // Don't steal keys from text fields or focused controls/content actions.
      if (e.target.isContentEditable || e.target.closest('input, textarea, select, button, a, [role="button"], [role="link"]')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          Player.togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) Player.seekBy(15);
          else if (e.ctrlKey || e.metaKey) Player.next();
          else Player.seekBy(10);
          break;
        case 'ArrowLeft':
          if (e.shiftKey) Player.seekBy(-15);
          else if (e.ctrlKey || e.metaKey) Player.previous();
          else Player.seekBy(-10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          Player.setVolume(Player.volume + 0.05);
          UI.updateVolumeUI(Player.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          Player.setVolume(Player.volume - 0.05);
          UI.updateVolumeUI(Player.volume);
          break;
        case 'm':
        case 'M':
          Player.toggleMute();
          break;
        case 's':
        case 'S':
          Player.toggleShuffle();
          break;
        case 'r':
        case 'R':
          Player.cycleRepeat();
          break;
        case 'q':
        case 'Q':
          navigate('queue');
          break;
      }
    });
  };

  const setupActionKeyboardAccess = () => {
    const enhance = (root) => {
      if (!root || root.nodeType !== 1) return;
      const items = [];
      if (root.matches('[data-action]')) items.push(root);
      items.push(...root.querySelectorAll('[data-action]'));
      items.forEach((item) => {
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(item.tagName)) return;
        if (!item.hasAttribute('tabindex')) item.tabIndex = 0;
        if (!item.hasAttribute('role')) item.setAttribute('role', item.dataset.action === 'navigate' ? 'link' : 'button');
      });
    };

    enhance(document.getElementById('app'));
    const appRoot = document.getElementById('app');
    if (appRoot && window.MutationObserver) {
      const observer = new MutationObserver((records) => {
        records.forEach(record => record.addedNodes.forEach(enhance));
      });
      observer.observe(appRoot, { childList: true, subtree: true });
    }

    document.addEventListener('keydown', (event) => {
      if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
      const action = event.target.closest && event.target.closest('[data-action]');
      if (!action || !action.hasAttribute('tabindex')) return;
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(action.tagName)) return;
      event.preventDefault();
      action.click();
    });
  };

  // ── File input change handler ───────────────────────────────
  const setupFileInput = () => {
    document.addEventListener('click', (e) => {
      // Close playlist dropdown if click outside
      const dropdowns = document.querySelectorAll('.playlist-more-dropdown');
      dropdowns.forEach(d => {
        if (d.style.display === 'block' && !e.target.closest('.playlist-more-menu-container')) {
          d.style.display = 'none';
        }
      });
    });
    
    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-action="import-files"]')) {
        if (e.target.files.length) {
          LocalFiles.handleFiles(e.target.files);
        }
      }
    });
  };

  // ── Context menu on right-click ─────────────────────────────
  const setupContextMenu = () => {
    document.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.track-row[data-track-id]');
      if (row) {
        const track = resolveTrack(row.dataset.trackId);
        if (track) UI.showContextMenu(e, track);
      }
    });
  };

  // ── Local files updated ─────────────────────────────────────
  const setupLocalFilesListener = () => {
    document.addEventListener('localfiles:updated', () => {
      if (currentView === 'library') {
        const contentBody = document.querySelector('.content-body');
        if (contentBody) {
          contentBody.innerHTML = UI.renderLibrary();
          const localTab = contentBody.querySelector('.source-tab[data-source="local"]');
          if (localTab) {
            localTab.click();
          }
        }
      } else if (currentView === 'downloaded') {
        renderView();
      }
    });
  };

  // ── Modals ──────────────────────────────────────────────────
  const setupModals = () => {
    const modal = document.getElementById('create-playlist-modal');
    const closeBtn = document.getElementById('create-playlist-close');
    const cancelBtn = document.getElementById('create-playlist-cancel');
    const submitBtn = document.getElementById('create-playlist-submit');
    const input = document.getElementById('create-playlist-input');

    if (modal && submitBtn && input) {
      const closeModal = () => {
        modal.classList.add('hidden');
        input.value = '';
      };

      const submitPlaylist = () => {
        const name = input.value.trim();
        if (name) {
          const p = MusicData.createPlaylist(name);
          if (window.UI) window.UI.showToast("Playlist created!");
          closeModal();
          navigate('playlist', p.id);
        }
      };

      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      submitBtn.addEventListener('click', submitPlaylist);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitPlaylist();
        if (e.key === 'Escape') closeModal();
      });
    }

    // --- Settings Modal ---
    const settingsBtn = document.getElementById('header-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-close');
    const settingsSave = document.getElementById('settings-save');
    const aiConfigStatus = document.getElementById('ai-config-status');
    
    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (aiConfigStatus) {
          aiConfigStatus.textContent = window.hasServerGroqKey
            ? 'AI features are ready.'
            : 'AI features are unavailable until the server is configured.';
        }
        settingsModal.classList.remove('hidden');
        document.getElementById('account-modal')?.classList.add('hidden');
      });
      
      const closeSettings = () => settingsModal.classList.add('hidden');
      if (settingsClose) settingsClose.addEventListener('click', closeSettings);
      settingsModal.addEventListener('click', (e) => { if(e.target===settingsModal) closeSettings(); });
      
      if (settingsSave) settingsSave.addEventListener('click', closeSettings);
    }

    // --- AI Playlist Modal ---
    const aiTriggers = document.querySelectorAll('.js-ai-playlist-trigger');
    const aiModal = document.getElementById('ai-playlist-modal');
    const aiClose = document.getElementById('ai-playlist-close');
    const aiCancel = document.getElementById('ai-playlist-cancel');
    const aiSubmit = document.getElementById('ai-playlist-submit');
    const aiInput = document.getElementById('ai-playlist-input');
    const aiStatus = document.getElementById('ai-playlist-status');

    if (aiTriggers.length && aiModal && aiInput && aiSubmit) {
      const setAiStatus = (message = '', tone = 'neutral') => {
        if (!aiStatus) return;
        aiStatus.textContent = message;
        aiStatus.style.color = tone === 'error' ? 'var(--color-danger)' : 'var(--color-text-secondary)';
      };
      const setAiBusy = (isBusy) => {
        aiSubmit.disabled = isBusy;
        if (aiCancel) aiCancel.disabled = isBusy;
        aiSubmit.textContent = isBusy ? 'Generating...' : 'Generate';
        if (isBusy) setAiStatus('Finding songs that match your prompt...');
      };
      const openAiModal = (prefill = '') => {
        aiInput.value = prefill;
        setAiBusy(false);
        setAiStatus('');
        aiModal.classList.remove('hidden');
        setTimeout(() => aiInput.focus(), 0);
      };
      const closeAiModal = () => {
        aiModal.classList.add('hidden');
        setAiBusy(false);
        setAiStatus('');
      };

      aiTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          openAiModal();
        });
      });

      if (aiClose) aiClose.addEventListener('click', closeAiModal);
      if (aiCancel) aiCancel.addEventListener('click', closeAiModal);
      aiModal.addEventListener('click', (e) => { if(e.target===aiModal) closeAiModal(); });

      const submitAiPlaylist = async () => {
        const prompt = aiInput.value.trim();

        if (!prompt) {
          setAiStatus('Describe a vibe, genre, mood, or theme first.', 'error');
          aiInput.focus();
          return;
        }
        if (prompt.length > 500) {
          setAiStatus('Keep playlist prompts under 500 characters.', 'error');
          return;
        }

        if (!window.AIService || typeof window.AIService.generatePlaylistFromPrompt !== 'function') {
          setAiStatus('AI service is not available. Reload the app and try again.', 'error');
          return;
        }

        setAiBusy(true);

        try {
          const aiResult = await window.AIService.generatePlaylistFromPrompt(prompt);
          const songs = Array.isArray(aiResult.songs)
            ? [...new Set(aiResult.songs.filter(song => typeof song === 'string').map(song => song.trim()).filter(Boolean))].slice(0, 10)
            : [];
          if (!songs.length) {
            throw new Error('The AI response did not include any songs.');
          }

          const newPlaylist = MusicData.createPlaylist(typeof aiResult.title === 'string' && aiResult.title.trim() ? aiResult.title.trim().slice(0, 80) : prompt.slice(0, 80));
          newPlaylist.description = typeof aiResult.description === 'string' ? aiResult.description.slice(0, 240) : '';
          let addedCount = 0;

          const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
          const matchScore = (query, track) => {
            const queryTerms = new Set(normalize(query));
            const trackTerms = new Set(normalize(`${track.title} ${track.artist}`));
            if (!queryTerms.size || !trackTerms.size) return 0;
            let overlap = 0;
            queryTerms.forEach(term => { if (trackTerms.has(term)) overlap++; });
            return overlap / queryTerms.size;
          };
          for (let offset = 0; offset < songs.length; offset += 3) {
            const batch = songs.slice(offset, offset + 3);
            setAiStatus(`Finding matching tracks (${Math.min(offset + batch.length, songs.length)} of ${songs.length})…`);
            const searchResults = await Promise.all(batch.map(songQuery => MusicData.searchSaavn(songQuery)));
            searchResults.forEach((searchRes, index) => {
              const candidates = Array.isArray(searchRes && searchRes.tracks) ? searchRes.tracks : [];
              const bestMatch = candidates
                .map(track => ({ track, score: matchScore(batch[index], track) }))
                .sort((a, b) => b.score - a.score)[0];
              if (bestMatch && bestMatch.score >= 0.35 && !newPlaylist.tracks.some(track => track.id === bestMatch.track.id)) {
                MusicData.addTrackToPlaylist(newPlaylist.id, bestMatch.track);
                addedCount += 1;
              }
            });
          }

          if (addedCount < songs.length && addedCount > 0) {
            newPlaylist.description = `${newPlaylist.description}${newPlaylist.description ? ' ' : ''}${addedCount} of ${songs.length} suggested tracks matched.`;
          }

          if (!addedCount) {
            MusicData.deletePlaylist(newPlaylist.id);
            throw new Error('No close song matches were found. Try naming an artist, genre, or decade.');
          }

          if (window.UI) window.UI.showToast(`AI playlist generated with ${addedCount} matched songs!`);
          closeAiModal();
          navigate('playlist', newPlaylist.id);
        } catch (err) {
          console.error(err);
          setAiStatus(err.message || 'Failed to generate playlist. Try again later.', 'error');
          if (window.UI) window.UI.showToast('Failed to generate playlist.');
        } finally {
          setAiBusy(false);
        }
      };

      aiSubmit.addEventListener('click', submitAiPlaylist);
      aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAiPlaylist();
      });
    }

    // Rename Modal
    const renameModal = document.getElementById('rename-playlist-modal');
    const renameCloseBtn = document.getElementById('rename-playlist-close');
    const renameCancelBtn = document.getElementById('rename-playlist-cancel');
    const renameSubmitBtn = document.getElementById('rename-playlist-submit');
    const renameInput = document.getElementById('rename-playlist-input');

    if (renameModal && renameSubmitBtn && renameInput) {
      const closeRenameModal = () => {
        renameModal.classList.add('hidden');
        renameInput.value = '';
      };

      const submitRename = () => {
        const id = renameSubmitBtn.dataset.playlistId;
        const newName = renameInput.value.trim();
        if (id && newName) {
          MusicData.renamePlaylist(id, newName);
          if (window.UI) {
             UI.showToast("Playlist renamed successfully!");
          }
          navigate('playlist', id);
          if (typeof renderView === 'function') renderView(); // Force UI update
        }
        closeRenameModal();
      };

      if (renameCloseBtn) renameCloseBtn.addEventListener('click', closeRenameModal);
      if (renameCancelBtn) renameCancelBtn.addEventListener('click', closeRenameModal);
      renameModal.addEventListener('click', (e) => {
        if (e.target === renameModal) closeRenameModal();
      });
      renameSubmitBtn.addEventListener('click', submitRename);
      renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitRename();
        if (e.key === 'Escape') closeRenameModal();
      });
    }

    // Delete Modal
    const deleteModal = document.getElementById('delete-playlist-modal');
    const deleteCloseBtn = document.getElementById('delete-playlist-close');
    const deleteCancelBtn = document.getElementById('delete-playlist-cancel');
    const deleteSubmitBtn = document.getElementById('delete-playlist-submit');

    if (deleteModal && deleteSubmitBtn) {
      const closeDeleteModal = () => {
        deleteModal.classList.add('hidden');
      };

      const submitDelete = () => {
        const id = deleteSubmitBtn.dataset.playlistId;
        if (id) {
          MusicData.deletePlaylist(id);
          if (window.UI) {
             UI.showToast("Playlist deleted successfully!");
          }
          navigate('home');
        }
        closeDeleteModal();
      };

      if (deleteCloseBtn) deleteCloseBtn.addEventListener('click', closeDeleteModal);
      if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', closeDeleteModal);
      deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
      });
      deleteSubmitBtn.addEventListener('click', submitDelete);
    }
  };

  // ── Init ────────────────────────────────────────────────────
  const App = {
    init() {
      console.log('[App] Initialising BeatFlow...');
      // Remove API keys saved by older versions; browser storage is not a safe secret store.
      try { localStorage.removeItem('groq_api_key'); } catch (_) {}

      // Fetch server configuration
      fetch('/api/config')
        .then(res => res.json())
        .then(config => {
          window.hasServerGroqKey = !!config.hasGroqKey;
          window.hasAccounts = !!config.hasAccounts;
          document.dispatchEvent(new CustomEvent('server:config', { detail: config }));
          const status = document.getElementById('ai-config-status');
          const modal = document.getElementById('settings-modal');
          if (status && modal && !modal.classList.contains('hidden')) {
            status.textContent = window.hasServerGroqKey
              ? 'AI features are ready.'
              : 'AI features are unavailable until the server is configured.';
          }
        })
        .catch(err => console.warn('Could not fetch server configuration:', err));

      // 1. Init modules
      Player.init();
      LocalFiles.init();
      if (window.Visualizer) Visualizer.init();

      // 2. Set up router
      window.addEventListener('hashchange', renderView);

      // 3. Event delegation on content body
      const contentBody = document.querySelector('.content-body');
      if (contentBody) {
        contentBody.addEventListener('click', handleContentClick);
      }
      
      // Global event delegation for source tabs
      document.addEventListener('click', handleSourceTab);

      // 4. Player bar controls
      setupPlayerControls();

      // 5. Player events
      setupPlayerEvents();

      // 6. Search
      setupSearch();

      // 7. Sidebar & mobile nav
      setupNav();

      // 8. Keyboard shortcuts
      setupActionKeyboardAccess();
      setupKeyboard();

      // 9. File input
      setupFileInput();

      // 10. Context menu
      setupContextMenu();

      // 11. Local files listener
      setupLocalFilesListener();

      document.addEventListener('library:profilechange', renderView);
      document.addEventListener('library:synced', () => {
        if (['library', 'liked', 'downloaded', 'playlist'].includes(currentView)) renderView();
      });

      // 12. Initial volume UI
      UI.updatePlayPauseBtn();
      UI.updateVolumeUI(Player.volume);
      UI.updateTransportState();
      UI.updatePlaybackModeUI();

      // 13. Setup modals
      setupModals();

      // 13. Navigate to initial route
      if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = '#home';
      }
      renderView();

      if (window.AuthManager) window.AuthManager.init();

      // PWA: Service Worker registration
      registerServiceWorker();

      console.log('[App] BeatFlow ready!');
    },

    navigate
  };

  // ── PWA Service Worker Helper ──
  const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('[PWA] Service Worker registered with scope:', reg.scope))
          .catch((err) => console.warn('[PWA] Service Worker registration failed:', err));
      });
    }
  };

  // ── Bootstrap ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }

  window.App = App;
})();


