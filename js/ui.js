/* ============================================================
   Pulse Music — ui.js
   UI Renderer & View Management
   ============================================================ */
(function () {
  'use strict';

  // ── Genre color map ─────────────────────────────────────────
  const GENRE_COLORS = {
    'Pop': '#68B8EF', 'Rock': '#378ACB', 'Electronic': '#8279E8',
    'Jazz': '#6878DF', 'Hip-Hop': '#4A84D9', 'Classical': '#6F7FCE',
    'Ambient': '#95D2F2', 'Lo-fi': '#5579B8', 'R&B': '#5A73B8',
    'Metal': '#29364A', 'Folk': '#7288BB', 'Country': '#536CA5',
    'Reggae': '#4778A8', 'Soul': '#6878DF', 'Punk': '#40599B'
  };

  // Genre illustrations use one consistent, lightweight SVG style so the
  // browse cards stay crisp at every size without depending on remote art.
  const GENRE_ICONS = {
    'Pop': '<path d="m32 7 5.2 17.8L55 30l-17.8 5.2L32 53l-5.2-17.8L9 30l17.8-5.2L32 7Z"/><path d="m49 8 1.7 5.3L56 15l-5.3 1.7L49 22l-1.7-5.3L42 15l5.3-1.7L49 8Z"/>',
    'Rock': '<path d="m36 6-20 29h14l-2 23 20-32H34l2-20Z"/>',
    'Electronic': '<path d="M12 46V31m10 15V18m10 28V26m10 20V12m10 34V22"/><path d="M8 51h48"/>',
    'Jazz': '<circle cx="32" cy="32" r="23"/><circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="4"/><path d="M32 9a23 23 0 0 1 23 23"/>',
    'Hip-Hop': '<path d="M13 35v-5a19 19 0 0 1 38 0v5"/><rect x="10" y="33" width="9" height="16" rx="4"/><rect x="45" y="33" width="9" height="16" rx="4"/><path d="M19 47h5a8 8 0 0 0 8 7h4"/>',
    'Classical': '<rect x="8" y="15" width="48" height="34" rx="4"/><path d="M16 16v20m8-20v20m8-20v20m8-20v20m8-20v20M8 37h48"/><path d="M20 16v12m16-12v12m16-12v12" stroke-width="3"/>',
    'Ambient': '<circle cx="32" cy="32" r="7"/><ellipse cx="32" cy="32" rx="25" ry="11" transform="rotate(-28 32 32)"/><circle cx="51" cy="20" r="3" fill="currentColor" stroke="none"/><path d="m13 13 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z"/>',
    'Lo-fi': '<path d="M43 41A21 21 0 0 1 23 11a22 22 0 1 0 30 27 20 20 0 0 1-10 3Z"/><path d="m47 12 1.5 4.5L53 18l-4.5 1.5L47 24l-1.5-4.5L41 18l4.5-1.5L47 12Z"/>',
    'R&B': '<rect x="25" y="8" width="14" height="29" rx="7"/><path d="M19 29v3a13 13 0 0 0 26 0v-3M32 45v10m-9 0h18"/>',
    'Metal': '<path d="m18 44 21-21 7 7-21 21-7-7Z"/><path d="m35 27 7 7m-12-2 7 7m-12-2 7 7M18 44l-5 7 7-2"/><path d="m39 23 5-5 7 7-5 5m-2-12 5-5 7 7-5 5"/>',
    'Folk': '<path d="M32 53C13 43 11 22 31 10c14 13 16 30 1 43Z"/><path d="M32 51c0-14-5-23-14-30m14 20c4-8 9-13 16-16m-16 7c-4-4-8-6-12-7"/>',
    'Country': '<path d="M19 48c-5-5-5-12 0-17l14-14 12 12-14 14c-5 5-8 10-12 5Z"/><circle cx="40" cy="25" r="3"/><path d="m16 45 6 6m6-25 10 10m-16-4 7 7m5-22 5-5 12 12-5 5"/>',
    'Reggae': '<circle cx="32" cy="32" r="11"/><path d="M32 6v8m0 36v8M6 32h8m36 0h8M13.6 13.6l5.7 5.7m25.4 25.4 5.7 5.7m0-36.8-5.7 5.7m-25.4 25.4-5.7 5.7"/>',
    'Soul': '<path d="M27 48V15l24-5v31"/><ellipse cx="20" cy="49" rx="7" ry="5"/><ellipse cx="44" cy="42" rx="7" ry="5"/><path d="M27 23l24-5"/>',
    'Punk': '<path d="m32 7 5.7 17.3L56 30l-18.3 5.7L32 54l-5.7-18.3L8 30l18.3-5.7L32 7Z"/><path d="m32 17 3.7 9.3L45 30l-9.3 3.7L32 43l-3.7-9.3L19 30l9.3-3.7L32 17Z"/>'
  };

  const renderGenreCard = (genre) => `
    <button type="button" class="genre-card" style="--genre-accent:${GENRE_COLORS[genre] || '#68B8EF'}" data-action="browse-genre" data-genre="${esc(genre)}" aria-label="Browse ${esc(genre)} music">
      <svg class="genre-card__icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${GENRE_ICONS[genre] || GENRE_ICONS.Pop}</svg>
      <span class="genre-card__title">${esc(genre)}</span>
      <span class="genre-card__hint" aria-hidden="true">Explore genre <span>↗</span></span>
    </button>`;

  // ── Helpers ─────────────────────────────────────────────────
  const esc = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Content target
  const getContentBody = () => document.querySelector('.content-body');

  // ── Card Components ─────────────────────────────────────────
  const createCard = (item, type = 'album') => {
    item.type = type; // Ensure type is tracked
    const itemStr = esc(JSON.stringify(item));
    if (type === 'track') {
      const id = item.id || '';
      return `
      <div class="card" data-action="play-track" data-track-id="${esc(id)}" data-item='${itemStr}' title="${esc(item.title || item.name)}">
        <div class="card-img-wrap">
          <img class="card-img" src="${esc(item.coverUrl || item.imageUrl)}" alt="${esc(item.title || item.name)}" loading="lazy" onerror="this.src='https://picsum.photos/seed/fallback/300/300'">
          <button class="card-play-btn" data-action="play-track" data-track-id="${esc(id)}" aria-label="Play">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
        </div>
        <div class="card-info">
          <div class="card-title">${esc(item.title || item.name)}</div>
          <div class="card-subtitle">${esc(item.artist || item.description || (item.genres ? item.genres.join(', ') : ''))}</div>
        </div>
      </div>`;
    }
    
    const view = type === 'playlist' ? 'playlist' : (type === 'artist' ? 'artist' : 'album');
    const id = item.id || '';
    const imgClass = type === 'artist' ? 'card-img card-img-round' : 'card-img';
    return `
      <div class="card ${type === 'artist' ? 'card-artist' : ''}" data-action="navigate" data-view="${view}" data-id="${esc(id)}" data-item='${itemStr}' title="${esc(item.title || item.name)}">
        <div class="card-img-wrap">
          <img class="${imgClass}" src="${esc(item.coverUrl || item.imageUrl)}" alt="${esc(item.title || item.name)}" loading="lazy" onerror="this.src='https://picsum.photos/seed/fallback/300/300'">
          <button class="card-play-btn" data-action="play-collection" data-type="${view}" data-id="${esc(id)}" aria-label="Play">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
        </div>
        <div class="card-info">
          <div class="card-title">${esc(item.title || item.name)}</div>
          <div class="card-subtitle">${esc(item.artist || item.description || (item.genres ? item.genres.join(', ') : ''))}</div>
        </div>
      </div>`;
  };

  const createArtistCard = (artist) => createCard(artist, 'artist');

  const createTrackRow = (track, index, options = {}) => {
    const { showAlbum = true, showCover = true } = options;
    const isPlaying = window.Player && Player.currentTrack && Player.currentTrack.id === track.id;
    const duration = window.MusicData ? MusicData.formatDuration(track.duration) : '0:00';
    return `
      <div class="track-row ${isPlaying ? 'playing' : ''}" data-action="play-track" data-track-id="${esc(track.id)}" data-track='${esc(JSON.stringify(track))}' data-context-menu="track">
        <div class="track-number">
          <span class="track-number-text">${isPlaying ? '<span class="playing-icon">🎶</span>' : (index + 1)}</span>
          <svg class="play-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
        ${showCover ? `<img class="track-row-cover" src="${esc(track.coverUrl)}" alt="" loading="lazy" onerror="this.src='https://picsum.photos/seed/fallback/40/40'">` : ''}
        <div class="track-info">
          <div class="track-title">${esc(track.title)}</div>
          <div class="track-artist" data-action="navigate" data-view="artist" data-id="${esc(track.artistId)}">${esc(track.artist)}</div>
        </div>
        ${showAlbum ? `<div class="track-album" data-action="navigate" data-view="album" data-id="${esc(track.albumId)}">${esc(track.album || '')}</div>` : ''}
        <div class="track-duration">${duration}</div>
        <button class="track-more" data-action="track-menu" data-track-id="${esc(track.id)}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </button>
      </div>
    `;
  };

  // ── Skeleton loader ─────────────────────────────────────────
  const showSkeleton = (container) => {
    if (!container) return;
    const skeletons = Array(6).fill('').map(() =>
      `<div class="skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text-sm"></div>
      </div>`
    ).join('');
    container.innerHTML = `<div class="cards-row">${skeletons}</div>`;
  };

  // ── Spotify-Style Skeleton Renderers ───────────────────────
  const renderAlbumSkeleton = () => {
    const trackRows = Array(6).fill('').map(() => `
      <div class="skeleton-track-row">
        <div class="skeleton-num"></div>
        <div class="skeleton-track-info">
          <div class="skeleton-track-line"></div>
          <div class="skeleton-track-line"></div>
        </div>
        <div class="skeleton-dur"></div>
      </div>
    `).join('');

    return `
      <div class="skeleton-hero">
        <div class="skeleton-cover"></div>
        <div class="skeleton-details">
          <div class="skeleton-type"></div>
          <div class="skeleton-title-block"></div>
          <div class="skeleton-meta"></div>
        </div>
      </div>
      <div class="skeleton-actions">
        <div class="skeleton-btn"></div>
        <div class="skeleton-btn-sm"></div>
      </div>
      <div style="margin-top: 8px">
        ${trackRows}
      </div>
    `;
  };

  const renderSearchDropdownLoading = () => {
    return Array(4).fill('').map(() => `
      <div class="search-dropdown-skeleton-row">
        <div class="skeleton-img"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>
    `).join('');
  };

  const renderCardsSkeleton = (count = 6) => {
    return `<div class="skeleton-card-grid">
      ${Array(count).fill('').map(() => `
        <div class="skeleton-card-item">
          <div class="skeleton-card-img"></div>
          <div class="skeleton-card-text"></div>
          <div class="skeleton-card-text"></div>
        </div>
      `).join('')}
    </div>`;
  };

  const renderTracksSkeleton = (count = 5) => {
    return Array(count).fill('').map(() => `
      <div class="skeleton-track-row">
        <div class="skeleton-num"></div>
        <div class="skeleton-track-info">
          <div class="skeleton-track-line"></div>
          <div class="skeleton-track-line"></div>
        </div>
        <div class="skeleton-dur"></div>
      </div>
    `).join('');
  };

  const renderHomeLoadingSkeleton = () => {
    const section = (title, count = 6, kind = 'cards') => `
      <section class="section home-skeleton-section">
        <div class="section-header"><h2>${title}</h2></div>
        <div class="cards-row">
          <div class="cards-row-inner home-skeleton-cards ${kind === 'artists' ? 'home-skeleton-artists' : ''}">
            ${renderCardsSkeleton(count)}
          </div>
        </div>
      </section>
    `;

    return `
      <div class="home-page-loading" role="status" aria-label="Loading your home page" aria-busy="true">
        <section class="section home-skeleton-section">
          <div class="home-skeleton-block home-skeleton-greeting" aria-hidden="true"></div>
        </section>
        ${section('Recently Played')}
        ${section('Recently Searched')}
        <section class="section home-skeleton-section">
          <div class="section-header"><h2>Trending on Trending</h2></div>
          <div class="cards-row"><div class="cards-row-inner home-skeleton-cards">${renderCardsSkeleton(6)}</div></div>
        </section>
        ${section('Made For You', 6)}
        ${section('Popular Artists', 6, 'artists')}
        <section class="section home-skeleton-section">
          <div class="section-header"><h2>Browse Genres</h2></div>
          <div class="home-skeleton-genres" aria-hidden="true">
            ${Array(8).fill('<span class="home-skeleton-block"></span>').join('')}
          </div>
        </section>
      </div>
    `;
  };

  // ── View: Home ──────────────────────────────────────────────
  const renderHome = (options = {}) => {
    if (options.homeLoading === true) return renderHomeLoadingSkeleton();

    const playlists = MusicData.getPlaylists();
    const albums = MusicData.getAlbums();
    const artists = MusicData.getArtists();
    const trendingLoading = options.trendingLoading === true;

    const quickAlbums = albums.slice(0, 6);

    return `
      <div class="home-page home-page-enter">
      <section class="section">
        <h1 class="section-greeting">${getGreeting()}</h1>
      </section>

      ${window.MusicData && MusicData.getRecentlyPlayed && MusicData.getRecentlyPlayed().length > 0 ? `
      <section class="section">
        <div class="section-header">
          <h2>Recently Played</h2>
        </div>
        <div class="cards-row">
          <div class="cards-row-inner">
            ${MusicData.getRecentlyPlayed().slice(0, 6).map(t => createCard(t, 'track')).join('')}
          </div>
        </div>
      </section>` : ''}

      ${window.MusicData && MusicData.getRecentlySearched && MusicData.getRecentlySearched().length > 0 ? `
      <section class="section">
        <div class="section-header">
          <h2>Recently Searched</h2>
        </div>
        <div class="cards-row">
          <div class="cards-row-inner">
            ${MusicData.getRecentlySearched().slice(0, 6).map(item => createCard(item, item.type || 'track')).join('')}
          </div>
        </div>
      </section>` : ''}

      <section class="section">
        <div class="section-header">
          <h2>Trending on Trending</h2>
          <span class="section-see-all" data-action="navigate" data-view="search" data-id="">Show all</span>
        </div>
        <div class="cards-row" id="trending-row">
        <div class="cards-row-inner trending-grid" aria-busy="${trendingLoading ? 'true' : 'false'}">
            ${trendingLoading
              ? `<div class="home-trending-loading" role="status" aria-label="Loading trending music">${renderCardsSkeleton(6)}</div>`
              : quickAlbums.length > 0 ? quickAlbums.map(a => createCard(a, 'album')).join('') : renderCardsSkeleton(6)}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Made For You</h2>
        </div>
        <div class="cards-row">
          <div class="cards-row-inner">
            ${playlists.map(p => createCard(p, 'playlist')).join('')}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Popular Artists</h2>
        </div>
        <div class="cards-row">
          <div class="cards-row-inner">
            ${artists.slice(0, 8).map(a => createArtistCard(a)).join('')}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Browse Genres</h2>
        </div>
        <div class="genre-grid">
          ${MusicData.genres.map(renderGenreCard).join('')}
        </div>
      </section>
      </div>`;
  };

  // ── View: Search ────────────────────────────────────────────
  const getSearchRecommendations = () => {
    const allTracks = MusicData.getAllTracks();
    const recentTracks = MusicData.getRecentlyPlayed ? MusicData.getRecentlyPlayed().filter(track => track && track.id) : [];
    const searchedTracks = MusicData.getRecentlySearched
      ? MusicData.getRecentlySearched().filter(item => item && item.id && (item.type === 'track' || item.audioUrl))
      : [];
    const likedTracks = MusicData.getLikedSongs ? MusicData.getLikedSongs().filter(track => track && track.id) : [];
    const uniqueTracks = [...new Map(allTracks.filter(track => track && track.id).map(track => [track.id, track])).values()];

    const seeds = [
      ...likedTracks.map(track => ({ track, weight: 3 })),
      ...recentTracks.slice(0, 10).map((track, index) => ({ track, weight: Math.max(1, 2.6 - index * .16) })),
      ...searchedTracks.slice(0, 8).map((track, index) => ({ track, weight: Math.max(.8, 1.8 - index * .12) }))
    ];
    const genreWeights = new Map();
    const artistWeights = new Map();
    seeds.forEach(({ track, weight }) => {
      const genre = String(track.genre || '').toLocaleLowerCase();
      const artist = String(track.artistId || track.artist || '').toLocaleLowerCase();
      if (genre) genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight);
      if (artist) artistWeights.set(artist, (artistWeights.get(artist) || 0) + weight);
    });

    const avoidIds = new Set([
      ...recentTracks.slice(0, 4).map(track => track.id),
      ...searchedTracks.map(track => track.id)
    ]);
    const score = track => {
      const genre = String(track.genre || '').toLocaleLowerCase();
      const artist = String(track.artistId || track.artist || '').toLocaleLowerCase();
      return (genreWeights.get(genre) || 0) * 2 + (artistWeights.get(artist) || 0) * 1.25;
    };

    let candidates = uniqueTracks.filter(track => !avoidIds.has(track.id));
    if (candidates.length < 6) candidates = uniqueTracks.filter(track => !searchedTracks.some(item => item.id === track.id));
    candidates.sort((a, b) => score(b) - score(a));

    // Keep the suggestions varied when there is not enough listening history yet.
    const recommendations = [];
    const usedArtists = new Set();
    candidates.forEach(track => {
      const artist = String(track.artistId || track.artist || track.id).toLocaleLowerCase();
      if (recommendations.length < 6 && !usedArtists.has(artist)) {
        recommendations.push(track);
        usedArtists.add(artist);
      }
    });
    candidates.forEach(track => {
      if (recommendations.length < 6 && !recommendations.some(item => item.id === track.id)) recommendations.push(track);
    });
    return recommendations;
  };

  const renderSearch = (query = '') => {
    if (!query) {
      const historyTracks = MusicData.getRecentlyPlayed
        ? MusicData.getRecentlyPlayed().filter(item => item && item.id).slice(0, 8)
        : [];
      const searchedSongs = MusicData.getRecentlySearched
        ? MusicData.getRecentlySearched().filter(item => item && item.id && (item.type === 'track' || item.audioUrl)).slice(0, 8)
        : [];
      const recommendedTracks = getSearchRecommendations();
      const trackRow = (items, emptyMessage) => items.length
        ? `<div class="cards-row"><div class="cards-row-inner">${items.map(track => createCard(track, 'track')).join('')}</div></div>`
        : `<div class="search-landing-empty">${emptyMessage}</div>`;

      return `
        <div class="search-landing home-page-enter">
          <section class="section">
            <div class="section-header"><h2>Listening History</h2></div>
            ${trackRow(historyTracks, 'Songs you play will appear here.')}
          </section>
          <section class="section">
            <div class="section-header"><h2>Previously Searched Songs</h2></div>
            ${trackRow(searchedSongs, 'Songs you select from search results will appear here.')}
          </section>
          <section class="section">
            <div class="section-header"><h2>Recommended Songs</h2></div>
            ${trackRow(recommendedTracks, 'Play or like a few songs to get recommendations here.')}
          </section>
          <section class="section">
            <div class="section-header"><h2>Browse All</h2></div>
            <div class="genre-grid">
              ${MusicData.genres.map(renderGenreCard).join('')}
            </div>
          </section>
        </div>`;
    }

    const local = MusicData.searchLocal(query);
    const hasTracks = local.tracks.length > 0;
    const hasAlbums = local.albums.length > 0;
    const hasArtists = local.artists.length > 0;

    return `
      ${(hasTracks || hasAlbums || hasArtists) ? `
        <section class="section search-results" id="search-results">
          ${hasTracks ? `
            <h2>Songs</h2>
            <div class="track-list">
              ${local.tracks.slice(0, 10).map((t, i) => createTrackRow(t, i)).join('')}
            </div>` : ''}
          ${hasAlbums ? `
            <h2>Albums</h2>
            <div class="cards-row"><div class="cards-row-inner">
              ${local.albums.map(a => createCard(a, 'album')).join('')}
            </div></div>` : ''}
          ${hasArtists ? `
            <h2>Artists</h2>
            <div class="cards-row"><div class="cards-row-inner">
              ${local.artists.map(a => createArtistCard(a)).join('')}
            </div></div>` : ''}
        </section>
      ` : ''}
      <section class="section" id="Trending-search-results">
        <h2>Results from Trending</h2>
        <div id="saavn-results-container">
          <div class="saavn-loading-state">
            <div class="spotify-bar-loader">
              <div class="bar"></div>
              <div class="bar"></div>
              <div class="bar"></div>
              <div class="bar"></div>
            </div>
            <span class="loading-label">Searching Trending...</span>
          </div>
          ${renderTracksSkeleton(4)}
          <div style="margin-top: 16px">${renderCardsSkeleton(4)}</div>
        </div>
      </section>`;
  };

  // ── View: Library ───────────────────────────────────────────
  const renderLibrary = () => {
    const localTracks = MusicData.getLocalTracks();
    const allPlaylists = MusicData.getPlaylists();

    return `
      <div class="library-page home-page-enter">
        <section class="section library-header">
          <div class="library-heading-copy">
            <h1>Your Library</h1>
            <p>Playlists, saved music, and files in one place.</p>
          </div>
          <div class="source-tabs library-source-tabs" role="group" aria-label="Filter library content">
            <button class="source-tab active" data-source="all" aria-pressed="true">All</button>
            <button class="source-tab" data-source="local" aria-pressed="false">Local</button>
          </div>
        </section>

        <section class="section library-content" id="library-content">
        <div class="section" data-source-section="playlists">
          <div class="section-header">
            <h2>Playlists</h2>
          </div>
          <div class="cards-row"><div class="cards-row-inner">
            <button type="button" class="card library-create-card" data-action="create-playlist" aria-label="Create a playlist">
              <span class="library-create-icon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
              </span>
              <span class="library-create-label">Create playlist</span>
              <span class="library-create-hint">Build a collection for every mood</span>
            </button>
            <div class="card library-collection-card" data-action="navigate" data-view="liked" data-id="liked" title="Liked Songs" aria-label="Open Liked Songs">
              <div class="card-img-wrap library-collection-art library-liked-art">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <button class="card-play-btn" data-action="play-collection" data-type="liked" data-id="liked" aria-label="Play Liked Songs">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </button>
              </div>
              <div class="card-info">
                <div class="card-title">Liked Songs</div>
                <div class="card-subtitle">${MusicData.getLikedSongs().length} songs</div>
              </div>
            </div>
            <div class="card library-collection-card" data-action="navigate" data-view="downloaded" data-id="downloaded" title="Downloaded Music" aria-label="Open Downloaded Music">
              <div class="card-img-wrap library-collection-art library-download-art">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <button class="card-play-btn" data-action="play-collection" data-type="downloaded" data-id="downloaded" aria-label="Play Downloaded Music">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </button>
              </div>
              <div class="card-info">
                <div class="card-title">Downloaded Music</div>
                <div class="card-subtitle">${MusicData.getDownloadedSongs().length} songs</div>
              </div>
            </div>
            ${allPlaylists.map(p => createCard(p, 'playlist')).join('')}
          </div></div>
        </div>

        <div class="section" data-source-section="local">
          <div class="section-header">
            <h2>Local Files (${localTracks.length})</h2>
            <label class="import-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import Files
              <input type="file" accept="audio/*" multiple hidden data-action="import-files">
            </label>
          </div>
          ${localTracks.length > 0 ? `
            <div class="track-list">
              ${localTracks.map((t, i) => createTrackRow(t, i)).join('')}
            </div>
          ` : `
            <div class="empty-state library-empty-state">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <p>No local files yet</p>
              <p class="empty-hint">Import songs from your device to listen here.</p>
              <label class="btn btn-primary library-empty-import">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import Files
                <input type="file" accept="audio/*" multiple hidden data-action="import-files">
              </label>
            </div>
          `}
        </section>
      </div>`;
  };

  // ── View: Downloaded Songs ────────────────────────────────────
  const renderDownloadedSongs = () => {
    const downloadedTracks = MusicData.getDownloadedSongs();
    const totalDuration = downloadedTracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    const artwork = downloadedTracks.slice(0, 4);

    return `
      <div class="downloaded-page collection-detail-page">
        <section class="hero-banner downloaded-hero">
          <div class="downloaded-art" aria-hidden="true">
            <div class="downloaded-art-grid ${artwork.length ? `has-art artwork-count-${artwork.length}` : ''}">
              ${artwork.length ? artwork.map(track => `<img src="${esc(track.coverUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`).join('') : `
                <svg class="downloaded-art-empty-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              `}
            </div>
            <span class="downloaded-art-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg>
            </span>
          </div>
          <div class="hero-info">
            <span class="hero-type">YOUR OFFLINE LIBRARY</span>
            <h1 class="hero-title">Downloaded Music</h1>
            <p class="hero-description">Your saved tracks, ready to play offline on this device.</p>
            <div class="downloaded-stats">
              <span>${downloadedTracks.length} ${downloadedTracks.length === 1 ? 'track' : 'tracks'}</span>
              ${totalDuration ? `<span>${MusicData.formatDuration(totalDuration)} total</span>` : ''}
              <span class="downloaded-status ${downloadedTracks.length ? '' : 'no-downloads'}"><i aria-hidden="true"></i> ${downloadedTracks.length ? 'Available offline' : 'No downloads yet'}</span>
            </div>
            <div class="hero-actions downloaded-actions">
              <button class="btn btn-primary btn-play-large" data-action="play-collection" data-type="downloaded" data-id="downloaded" ${downloadedTracks.length === 0 ? 'disabled' : ''}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play all
              </button>
              <button class="btn btn-outline downloaded-shuffle" data-action="shuffle-collection" data-type="downloaded" data-id="downloaded" ${downloadedTracks.length === 0 ? 'disabled' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 5 0 0 5M4 20 21 3M4 4l5 5m4 4 8 8m0-5v5h-5"/></svg>
                Shuffle
              </button>
            </div>
          </div>
        </section>
        <section class="downloaded-track-section collection-track-section">
          <div class="collection-section-heading">
            <div><h2>Ready to play</h2><p>Every track saved for offline listening</p></div>
            ${downloadedTracks.length ? `<span>${downloadedTracks.length} ${downloadedTracks.length === 1 ? 'track' : 'tracks'}</span>` : ''}
          </div>
        ${downloadedTracks.length > 0 ? `
          <div class="collection-track-list">
            <div class="track-list-header">
              <span class="tlh-num">#</span>
              <span class="tlh-cover" aria-hidden="true"></span>
              <span class="tlh-title">Title</span>
              <span class="tlh-album">Album</span>
              <span class="tlh-duration"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
            </div>
            <div class="track-list downloaded-track-list">${downloadedTracks.map((t, i) => createTrackRow(t, i, { showCover: true })).join('')}</div>
          </div>
        ` : `
          <div class="empty-state downloaded-empty">
            <span class="downloaded-empty-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg></span>
            <p>Your offline library is ready</p>
            <p class="empty-hint">Save tracks from any menu and they’ll appear here for offline listening.</p>
            <button class="btn btn-outline" data-action="navigate" data-view="search">Explore music</button>
          </div>
        `}
        </section>
      </div>
    `;
  };

  // ── View: Liked Songs ─────────────────────────────────────────
  const renderLikedSongs = () => {
    const likedTracks = MusicData.getLikedSongs();
    
    return `
      <div class="liked-songs-page home-page-enter">
        <section class="section liked-songs-hero-section">
          <div class="hero-banner liked-songs-hero">
            <div class="liked-songs-art" aria-hidden="true">
              <span class="liked-songs-art-orbit"></span>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
            <div class="hero-info">
              <span class="hero-type">YOUR COLLECTION</span>
              <h1 class="hero-title">Liked Songs</h1>
              <p class="hero-description">The tracks you’ve saved, together in one place.</p>
              <div class="liked-songs-count">${likedTracks.length} ${likedTracks.length === 1 ? 'song' : 'songs'}</div>
            </div>
          </div>
          ${likedTracks.length > 0 ? `
            <div class="playlist-actions liked-songs-actions">
              <button class="btn-play-hero liked-songs-play-btn" data-action="play-collection" data-type="liked" data-id="liked" aria-label="Play liked songs">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                <span>Play all</span>
              </button>
              <button class="btn-shuffle-hero liked-songs-shuffle-btn" data-action="shuffle-collection" data-type="liked" data-id="liked" aria-label="Shuffle liked songs">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="16 16 21 21 21 16"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                <span>Shuffle</span>
              </button>
            </div>
          ` : ''}
        </section>
        <section class="section liked-songs-track-section">
          <div class="liked-songs-section-heading">
            <h2>In your collection</h2>
            <span>${likedTracks.length} ${likedTracks.length === 1 ? 'track' : 'tracks'}</span>
          </div>
          ${likedTracks.length > 0 ? `
            <div class="track-list-header">
              <span class="tlh-num">#</span>
              <span class="tlh-title">Title</span>
              <span class="tlh-album">Album</span>
              <span class="tlh-duration">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
            </div>
            <div class="track-list liked-songs-track-list">
              ${likedTracks.map((t, i) => createTrackRow(t, i, { showCover: true })).join('')}
            </div>
          ` : `
            <div class="empty-state liked-songs-empty">
              <span class="liked-songs-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </span>
              <p>Your collection starts here</p>
              <p class="empty-hint">Tap the heart on any track and it will be saved here.</p>
            </div>
          `}
        </section>
      </div>`;
  };

  // ── View: Playlist Detail ───────────────────────────────────
  const renderPlaylist = (playlistId) => {
    const playlist = MusicData.getPlaylistById(playlistId);
    if (!playlist) return `<div class="empty-state"><p>Playlist not found</p></div>`;

    const totalDuration = playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

    return `
      <div class="hero-banner" style="background:${playlist.gradient || 'linear-gradient(135deg,#68B8EF,#172235)'}">
        <img class="hero-cover" src="${esc(playlist.coverUrl)}" alt="${esc(playlist.name)}" loading="lazy" onerror="this.src='https://picsum.photos/seed/fallback/230/230'">
        <div class="hero-info">
          <span class="hero-type">PLAYLIST</span>
          <h1 class="hero-title">${esc(playlist.name)}</h1>
          <p class="hero-description">${esc(playlist.description)}</p>
          <div class="hero-meta">${playlist.tracks.length} songs · ${MusicData.formatDuration(totalDuration)}</div>
        </div>
      </div>
      <div class="playlist-actions" style="display: flex; align-items: center; gap: 8px;">
        <button class="btn-play-hero" data-action="play-collection" data-type="playlist" data-id="${esc(playlist.id)}">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </button>
        <button class="btn-shuffle-hero" data-action="shuffle-collection" data-type="playlist" data-id="${esc(playlist.id)}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
        </button>
        ${playlist.id.startsWith('user-playlist') ? `
        <div class="playlist-more-menu-container" style="position: relative;">
           <button class="btn-more-hero" id="playlist-more-btn" data-action="toggle-playlist-menu" title="More options" style="background: transparent; border: none; color: var(--color-text-secondary); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 50%;">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="pointer-events: none;"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
           </button>
           <div class="playlist-more-dropdown" id="playlist-more-dropdown" style="display: none; position: absolute; top: 100%; left: 0; margin-top: 4px; background: rgba(20, 20, 20, 0.85); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--color-border); border-radius: 8px; padding: 4px 0; min-width: 160px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
             <button class="playlist-action-btn" data-action="rename-playlist" data-id="${esc(playlist.id)}" style="width: 100%; text-align: left; padding: 12px 16px; background: none; border: none; color: var(--color-text-primary); cursor: pointer; font-size: 14px;">Rename Playlist</button>
             <button class="playlist-action-btn" data-action="delete-playlist" data-id="${esc(playlist.id)}" style="width: 100%; text-align: left; padding: 12px 16px; background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 14px;">Delete Playlist</button>
           </div>
        </div>
        ` : ''}
      </div>
      <div class="track-list-header">
        <span class="tlh-num">#</span>
        <span class="tlh-title">Title</span>
        <span class="tlh-album">Album</span>
        <span class="tlh-duration">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </span>
      </div>
      <div class="track-list">
        ${playlist.tracks.map((t, i) => createTrackRow(t, i, { showCover: true })).join('')}
      </div>`;
  };

  // ── View: Album Detail ──────────────────────────────────────
  const renderAlbum = (albumId) => {
    const album = MusicData.getAlbumById(albumId);
    if (!album) return renderAlbumSkeleton();

    const totalDuration = album.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

    return `
      <div class="album-detail-page collection-detail-page">
        <section class="hero-banner album-detail-hero">
          <img class="hero-cover" src="${esc(album.coverUrl)}" alt="${esc(album.title)}" loading="lazy" onerror="this.src='https://picsum.photos/seed/album-fallback/300/300'">
          <div class="hero-info">
            <span class="hero-type">ALBUM</span>
            <h1 class="hero-title">${esc(album.title)}</h1>
            <div class="album-detail-meta">
              <button class="hero-artist" data-action="navigate" data-view="artist" data-id="${esc(album.artistId)}">${esc(album.artist)}</button>
              <span>${album.year || 'Album'}</span>
              <span>${album.tracks.length} ${album.tracks.length === 1 ? 'track' : 'tracks'}</span>
              <span>${MusicData.formatDuration(totalDuration)}</span>
            </div>
          </div>
        </section>
        <div class="playlist-actions album-detail-actions">
          <button class="btn-play-hero album-play-button" data-action="play-collection" data-type="album" data-id="${esc(album.id)}" aria-label="Play ${esc(album.title)}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            <span>Play album</span>
          </button>
          <button class="btn-shuffle-hero album-shuffle-button" data-action="shuffle-collection" data-type="album" data-id="${esc(album.id)}" aria-label="Shuffle ${esc(album.title)}">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 5 0 0 5M4 20 21 3M4 4l5 5m4 4 8 8m0-5v5h-5"/></svg>
            <span>Shuffle</span>
          </button>
        </div>
        <section class="collection-track-section album-track-section">
          <div class="collection-section-heading"><div><h2>Tracklist</h2><p>${esc(album.title)} by ${esc(album.artist)}</p></div><span>${album.tracks.length} ${album.tracks.length === 1 ? 'track' : 'tracks'}</span></div>
          <div class="collection-track-list">
            <div class="track-list-header">
              <span class="tlh-num">#</span>
              <span class="tlh-cover" aria-hidden="true"></span>
              <span class="tlh-title">Title</span>
              <span class="tlh-duration"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
            </div>
            <div class="track-list album-track-list">
              ${album.tracks.map((t, i) => createTrackRow(t, i, { showAlbum: false, showCover: true })).join('')}
            </div>
          </div>
        </section>
      </div>`;
  };

  // ── View: Artist Detail ─────────────────────────────────────
  const renderArtist = (artistId) => {
    const artist = MusicData.getArtistById(artistId);
    if (!artist) return `<div class="empty-state"><p>Artist not found</p></div>`;

    const artistTracks = MusicData.getTracksByArtistId(artistId);
    const artistAlbums = MusicData.getAlbumsByArtistId(artistId);

    return `
      <div class="hero-banner hero-artist-banner" style="background:linear-gradient(135deg, rgba(124,58,237,0.4), #121212)">
        <img class="hero-artist-img" src="${esc(artist.imageUrl)}" alt="${esc(artist.name)}" loading="lazy">
        <div class="hero-info">
          <span class="hero-type">ARTIST</span>
          <h1 class="hero-title hero-artist-name">${esc(artist.name)}</h1>
          <p class="hero-description">${esc(artist.bio)}</p>
          <div class="hero-meta">${artist.genres.join(', ')}</div>
        </div>
      </div>
      <div class="playlist-actions">
        <button class="btn-play-hero" data-action="play-artist" data-id="${esc(artist.id)}">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </button>
      </div>
      ${artistTracks.length > 0 ? `
        <section class="section">
          <h2>Popular</h2>
          <div class="track-list">
            ${artistTracks.map((t, i) => createTrackRow(t, i)).join('')}
          </div>
        </section>` : ''}
      ${artistAlbums.length > 0 ? `
        <section class="section">
          <h2>Albums</h2>
          <div class="cards-row"><div class="cards-row-inner">
            ${artistAlbums.map(a => createCard(a, 'album')).join('')}
          </div></div>
        </section>` : ''}`;
  };

  // ── View: Queue ─────────────────────────────────────────────
  const renderQueue = () => {
    const queue = window.Player ? Player.queue : [];
    const currentIdx = window.Player ? Player.queueIndex : -1;
    const current = window.Player ? Player.currentTrack : null;

    return `
      <section class="section">
        <h1>Queue</h1>
        ${current ? `
          <h3 class="queue-section-label">Now Playing</h3>
          <div class="track-list">
            ${createTrackRow(current, 0, { showCover: true })}
          </div>` : ''}
        ${queue.length > 1 ? `
          <h3 class="queue-section-label">Next Up</h3>
          <div class="track-list">
            ${queue.filter((_, i) => i > currentIdx).map((t, i) => createTrackRow(t, currentIdx + 1 + i, { showCover: true })).join('')}
          </div>` : ''}
        ${queue.length === 0 ? `
          <div class="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <p>Your queue is empty</p>
            <p class="empty-hint">Add songs to start your listening session</p>
          </div>` : ''}
      </section>`;
  };

  // ── Toast notifications ─────────────────────────────────────
  const showToast = (message) => {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.addEventListener('transitionend', () => toast.remove());
      // Safety cleanup
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
    }, 3000);
  };

  // ── Context menu ────────────────────────────────────────────
  const showContextMenu = (e, track) => {
    // Remove any existing context menu
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    if (!track) return;
    e.preventDefault();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <div class="ctx-item" data-ctx-action="add-to-queue" data-track-id="${esc(track.id)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add to Queue
      </div>
      <div class="ctx-item" data-ctx-action="go-artist" data-artist-id="${esc(track.artistId)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Go to Artist
      </div>
      <div class="ctx-item" data-ctx-action="go-album" data-album-id="${esc(track.albumId)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
        Go to Album
      </div>
      <div class="ctx-item" data-ctx-action="download-track" data-track-id="${esc(track.id)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        ${MusicData.isDownloaded(track.id) ? 'Remove from Aurafy Downloads' : 'Download & save offline'}
      </div>`;

    // If there are user playlists, add "Add to Playlist" submenu or just direct items for simplicity.
    const userPlaylists = MusicData.getUserPlaylists();
    if (userPlaylists.length > 0) {
      menu.innerHTML += `
        <div class="ctx-item" style="pointer-events:none; opacity:0.5; font-size:0.8rem; margin-top:8px;">Add to Playlist</div>
        ${userPlaylists.map(p => `
          <div class="ctx-item" data-ctx-action="add-to-playlist" data-playlist-id="${esc(p.id)}" data-track-id="${esc(track.id)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            ${esc(p.name)}
          </div>
        `).join('')}
      `;
    }
    
    // Check if we are inside a custom playlist view to show "Remove"
    const isPlaylistView = window.location.hash.startsWith('#playlist/user-playlist-');
    if (isPlaylistView) {
      const pId = window.location.hash.split('/')[1];
      menu.innerHTML += `
        <div class="ctx-item" style="color: #EF4444" data-ctx-action="remove-from-playlist" data-playlist-id="${esc(pId)}" data-track-id="${esc(track.id)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Remove from Playlist
        </div>
      `;
    }
    
    // Keep the menu above the player bar, and flip it upward for lower rows.
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const playerBar = document.querySelector('.player-bar');
    const playerStyle = playerBar ? window.getComputedStyle(playerBar) : null;
    const playerRect = playerBar && playerStyle?.display !== 'none' && playerStyle?.visibility !== 'hidden'
      ? playerBar.getBoundingClientRect()
      : null;
    const edgeGap = 12;
    let safeBottom = window.innerHeight - edgeGap;
    if (playerRect && playerRect.height > 0 && playerRect.top > 0) {
      safeBottom = Math.min(safeBottom, playerRect.top - edgeGap);
    }
    const maxMenuHeight = Math.max(72, safeBottom - edgeGap * 2);
    menu.style.maxHeight = `${maxMenuHeight}px`;
    menu.style.overflowY = 'auto';
    const fittedMenu = menu.getBoundingClientRect();
    const maxTop = Math.max(edgeGap, safeBottom - fittedMenu.height);
    let menuTop = e.clientY + 8;
    if (menuTop > maxTop) menuTop = e.clientY - fittedMenu.height - 8;
    menuTop = Math.max(edgeGap, Math.min(menuTop, maxTop));
    const menuLeft = Math.max(edgeGap, Math.min(e.clientX, window.innerWidth - fittedMenu.width - edgeGap));
    menu.style.left = `${menuLeft}px`;
    menu.style.top = `${menuTop}px`;
    menu.style.transformOrigin = menuTop < e.clientY ? 'bottom left' : 'top left';
    menu.style.visibility = 'visible';

    // Close on click outside
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu, true), 10);

    // Handle ctx clicks
    menu.addEventListener('click', async (ev) => {
      const item = ev.target.closest('.ctx-item');
      if (!item) return;
      const action = item.dataset.ctxAction;
      if (action === 'add-to-queue') {
        const t = MusicData.getTrackById(item.dataset.trackId);
        if (t) { Player.addToQueue(t); showToast('Added to queue'); }
      } else if (action === 'go-artist') {
        window.location.hash = `#artist/${item.dataset.artistId}`;
      } else if (action === 'go-album') {
        window.location.hash = `#album/${item.dataset.albumId}`;
      } else if (action === 'download-track') {
        if (track) {
          try {
            const result = await LocalFiles.downloadTrack(track);
            const message = result.removed
              ? 'Removed from Aurafy Downloads. The device file stays on your device.'
              : result.deviceDownloadStarted
                ? 'Device download started and saved in Aurafy Downloads.'
                : 'Saved in Aurafy Downloads, but the device download could not start.';
            showToast(message);
          } catch (error) {
            showToast(error.message || 'Could not save this track offline.');
          }
          // Re-render if on downloaded view
          if (window.location.hash === '#downloaded') {
            const contentBody = document.querySelector('.content-body');
            if (contentBody) contentBody.innerHTML = renderDownloadedSongs();
          }
        }
      } else if (action === 'add-to-playlist') {
        const t = MusicData.getTrackById(item.dataset.trackId);
        const pId = item.dataset.playlistId;
        if (t && pId) {
          MusicData.addTrackToPlaylist(pId, t);
          showToast('Added to playlist');
        }
      } else if (action === 'remove-from-playlist') {
        const pId = item.dataset.playlistId;
        const tId = item.dataset.trackId;
        if (pId && tId) {
          MusicData.removeTrackFromPlaylist(pId, tId);
          showToast('Removed from playlist');
          // Re-render playlist
          if (window.location.hash === `#playlist/${pId}`) {
            const contentBody = document.querySelector('.content-body');
            if (contentBody) contentBody.innerHTML = renderPlaylist(pId);
          }
        }
      }
      menu.remove();
      document.removeEventListener('click', closeMenu, true);
    });
  };

  // ── Update player bar ───────────────────────────────────────
  const updatePlayerUI = (track) => {
    if (!track) return;
    const art = document.querySelector('.player-album-art');
    const title = document.querySelector('.player-track-title');
    const artist = document.querySelector('.player-track-artist');
    const qualityBadges = document.querySelectorAll('.player-quality-badge');
    if (art) { art.src = track.coverUrl; art.alt = track.title; }
    if (title) title.textContent = track.title;
    if (artist) artist.textContent = track.artist;
    qualityBadges.forEach((badge) => {
      const quality = track.audioQuality ? `High quality · ${track.audioQuality}` : '';
      badge.textContent = track.audioQuality || '';
      badge.title = quality;
      badge.hidden = !track.audioQuality;
    });

    // Show player bar if hidden
    const bar = document.querySelector('.player-bar');
    if (bar) bar.classList.add('active');

    // Update liked state
    const likeBtns = document.querySelectorAll('.player-btn[data-action="like"]');
    const isLiked = MusicData.isLiked(track.id);
    likeBtns.forEach(btn => {
      btn.disabled = false;
      btn.classList.toggle('active', isLiked);
      btn.setAttribute('aria-pressed', String(isLiked));
      btn.setAttribute('aria-label', isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs');
      btn.title = isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs';
    });

    updateTransportState();

    // Update play/pause icon
    updatePlayPauseBtn();
    
    // Load lyrics for the new track
    loadLyrics(track);

    // Update fullscreen player if open
    const fsArt = document.querySelector('.fs-player-art');
    const fsTitle = document.querySelector('.fs-player-title');
    const fsArtist = document.querySelector('.fs-player-artist');
    const fsBg = document.querySelector('.fs-player-bg');
    if (fsArt) fsArt.src = track.coverUrl;
    if (fsTitle) fsTitle.textContent = track.title;
    if (fsArtist) fsArtist.textContent = track.artist;
    if (fsBg) fsBg.style.backgroundImage = `url("${track.coverUrl}")`;
  };

  const updatePlayPauseBtn = () => {
    const btns = document.querySelectorAll('.player-btn-main');
    if (!btns.length) return;
    const isPlaying = window.Player && Player.isPlaying;
    const innerHTML = isPlaying
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 5.5h3.2c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1H7.5c-.55 0-1-.45-1-1v-11c0-.55.45-1 1-1Zm7.8 0h3.2c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1h-3.2c-.55 0-1-.45-1-1v-11c0-.55.45-1 1-1Z"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.25 5.6c0-.76.84-1.22 1.48-.79l9.88 6.4c.58.38.58 1.22 0 1.59l-9.88 6.4c-.64.42-1.48-.03-1.48-.8V5.6Z"/></svg>';
    
    btns.forEach(btn => {
      btn.innerHTML = innerHTML;
      btn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      btn.setAttribute('aria-pressed', String(Boolean(isPlaying)));
      btn.title = isPlaying ? 'Pause' : 'Play';
    });

    const fs = document.querySelector('.fullscreen-player');
    if (fs) {
      if (isPlaying) fs.classList.add('is-playing');
      else fs.classList.remove('is-playing');
    }
  };

  const updateTransportState = () => {
    const hasQueue = Boolean(window.Player && Player.queue && Player.queue.length);
    document.querySelectorAll('.player-btn[data-action="prev"], .player-btn[data-action="next"]').forEach(btn => {
      btn.disabled = !hasQueue;
      btn.setAttribute('aria-disabled', String(!hasQueue));
    });

    const hasTrack = Boolean(window.Player && Player.currentTrack);
    document.querySelectorAll('.player-btn[data-action="like"]').forEach(btn => {
      btn.disabled = !hasTrack;
      btn.setAttribute('aria-disabled', String(!hasTrack));
    });
  };

  const updatePlaybackModeUI = () => {
    const isShuffle = Boolean(window.Player && Player.isShuffle);
    document.querySelectorAll('.player-btn[data-action="shuffle"]').forEach(btn => {
      btn.classList.toggle('active', isShuffle);
      btn.setAttribute('aria-pressed', String(isShuffle));
      btn.setAttribute('aria-label', isShuffle ? 'Shuffle on' : 'Shuffle');
      btn.title = isShuffle ? 'Shuffle on' : 'Shuffle';
    });

    const repeatMode = window.Player ? Player.repeatMode : 'off';
    const repeatLabel = repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat: off';
    document.querySelectorAll('.player-btn[data-action="repeat"]').forEach(btn => {
      btn.classList.toggle('active', repeatMode !== 'off');
      btn.classList.toggle('repeat-one', repeatMode === 'one');
      btn.classList.toggle('repeat-all', repeatMode === 'all');
      btn.setAttribute('aria-pressed', String(repeatMode !== 'off'));
      btn.setAttribute('aria-label', repeatLabel);
      btn.title = repeatLabel;
    });
  };

  // --- Live Lyrics Logic ---
  let currentLyrics = {
    lines: [], // {time, text, words:[{time, endTime, text}]}
    isSynced: false,
    hasWordSync: false,
    lastActiveLine: -1,
    lastActiveWord: -1,
    status: 'idle',
    trackId: null,
    track: null,
    syncingWords: false,
    syncError: ''
  };
  let lyricsRequestId = 0;
  let lyricsRequestController = null;
  let lyricsWordSyncController = null;

  const parseLrcTime = (minutes, seconds, fraction = '') => {
    const fractionValue = fraction ? Number(`0.${fraction}`) : 0;
    return (Number(minutes) * 60) + Number(seconds) + fractionValue;
  };

  const parseInlineLyricWords = (text, offset = 0) => {
    const pattern = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
    const markers = Array.from(String(text || '').matchAll(pattern));
    if (markers.length < 2) return [];
    return markers.map((marker, index) => {
      const start = marker.index + marker[0].length;
      const end = index + 1 < markers.length ? markers[index + 1].index : String(text).length;
      const value = String(text).slice(start, end);
      return {
        time: Math.max(0, parseLrcTime(marker[1], marker[2], marker[3]) + offset),
        text: value
      };
    }).filter(word => word.text.trim());
  };

  const parseLyrics = (text) => {
    const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r/g, '');
    const lines = source.split('\n');
    const parsed = [];
    const timeTag = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    let offset = 0;

    lines.forEach((line) => {
      const offsetMatch = line.match(/^\s*\[offset:([+-]?\d+)\]\s*$/i);
      if (offsetMatch) {
        offset = Number(offsetMatch[1]) / 1000;
        return;
      }
      const tags = Array.from(line.matchAll(timeTag));
      if (tags.length) {
        const lyricText = line.replace(timeTag, '').trim();
        if (!lyricText) return;
        const words = parseInlineLyricWords(lyricText, offset);
        tags.forEach(tag => parsed.push({
          time: Math.max(0, parseLrcTime(tag[1], tag[2], tag[3]) + offset),
          text: lyricText.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim(),
          words
        }));
        return;
      }
      // LRC metadata tags are not lyric lines.
      if (/^\s*\[[a-z]{2,8}:.*\]\s*$/i.test(line)) return;
      const clean = line.trim();
      if (clean) parsed.push({ time: null, text: clean, words: [] });
    });

    const timedCount = parsed.filter(line => Number.isFinite(line.time)).length;
    const isSynced = timedCount >= 2 && timedCount / Math.max(1, parsed.length) >= 0.7;
    if (isSynced) parsed.sort((a, b) => a.time - b.time);
    else parsed.forEach(line => { line.time = null; line.words = []; });
    return {
      isSynced,
      hasWordSync: isSynced && parsed.some(line => line.words.length > 1),
      lines: parsed
    };
  };

  const lyricsTextForAlignment = (lines) => (Array.isArray(lines) ? lines : []).map(line => String(line && line.text || '')).join('\n');
  const lyricsSyncButton = () => document.getElementById('lyrics-sync-words');

  const updateLyricsSyncAction = () => {
    const button = lyricsSyncButton();
    if (!button) return;
    const track = currentLyrics.track || (window.Player && Player.currentTrack);
    const audioUrl = String(track && track.audioUrl || '');
    const available = currentLyrics.status === 'line-synced' && !currentLyrics.hasWordSync &&
      !currentLyrics.syncingWords && track && track.source === 'saavn' && /^https:\/\//i.test(audioUrl) &&
      window.hasServerGroqKey !== false;
    button.hidden = !available;
    button.disabled = Boolean(currentLyrics.syncingWords);
    if (!currentLyrics.syncingWords) {
      button.innerHTML = currentLyrics.syncError
        ? '<span class="lyrics-word-sync-icon" aria-hidden="true">✦</span><span>Try word sync again</span>'
        : '<span class="lyrics-word-sync-icon" aria-hidden="true">✦</span><span>Sync words</span>';
    }
    button.title = currentLyrics.syncError || 'Click to send this Saavn audio URL and a lyric excerpt to Groq for word timing. Successful timings are saved on this device.';
  };

  const restoreCachedWordSync = (track, lines) => {
    if (!track || !track.id || !MusicData.getLyricsWordSync) return lines;
    const cached = MusicData.getLyricsWordSync(track.id, lyricsTextForAlignment(lines));
    if (!Array.isArray(cached) || cached.length !== lines.length) return lines;
    return lines.map((line, index) => {
      const saved = cached[index];
      return saved && saved.text === line.text && Array.isArray(saved.words) ? { ...line, words: saved.words } : line;
    });
  };

  const normalizeSyncToken = (value) => String(value || '')
    .normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

  const syncTokenSimilarity = (left, right) => {
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (Math.min(left.length, right.length) < 4) return 0;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= right.length; column += 1) {
        current[column] = Math.min(current[column - 1] + 1, previous[column] + 1,
          previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
      }
      previous = current;
    }
    return 1 - previous[right.length] / Math.max(left.length, right.length);
  };

  const alignLyricsToTranscriptWords = (lines, transcriptWords, duration) => {
    const recognized = (Array.isArray(transcriptWords) ? transcriptWords : [])
      .map(item => ({ key: normalizeSyncToken(item && (item.word || item.text)), time: Number(item && item.start), endTime: Number(item && item.end) }))
      .filter(item => item.key && Number.isFinite(item.time) && Number.isFinite(item.endTime) && item.endTime >= item.time)
      .sort((a, b) => a.time - b.time);
    if (recognized.length < 8) return null;

    const alignedLines = lines.map(line => ({ ...line, words: [] }));
    let transcriptCursor = 0;
    let lyricTokenCount = 0;
    let alignedTokenCount = 0;
    let alignedLineCount = 0;
    lines.forEach((line, lineIndex) => {
      if (!Number.isFinite(line.time)) return;
      const parts = String(line.text || '').match(/\S+\s*/gu) || [];
      const lyricTokens = parts.map((text, partIndex) => ({ text, partIndex, key: normalizeSyncToken(text) })).filter(token => token.key);
      lyricTokenCount += lyricTokens.length;
      if (!lyricTokens.length) return;

      const nextTimedLine = lines.slice(lineIndex + 1).find(nextLine => Number.isFinite(nextLine.time));
      const lowerBound = Math.max(0, line.time - 0.85);
      const upperBound = nextTimedLine ? nextTimedLine.time + 0.4 : (Number(duration) || line.time + 12);
      while (transcriptCursor < recognized.length && recognized[transcriptCursor].endTime < lowerBound) transcriptCursor += 1;
      let windowEnd = transcriptCursor;
      while (windowEnd < recognized.length && recognized[windowEnd].time <= upperBound) windowEnd += 1;
      if (windowEnd <= transcriptCursor) return;

      const matchedWords = new Map();
      let searchCursor = transcriptCursor;
      for (const token of lyricTokens) {
        let bestIndex = -1;
        let bestScore = 0;
        const searchEnd = Math.min(windowEnd, searchCursor + 7);
        for (let index = searchCursor; index < searchEnd; index += 1) {
          const score = syncTokenSimilarity(token.key, recognized[index].key);
          if (score > bestScore) { bestScore = score; bestIndex = index; }
          if (score === 1) break;
        }
        if (bestIndex >= 0 && bestScore >= 0.76) {
          matchedWords.set(token.partIndex, recognized[bestIndex]);
          searchCursor = bestIndex + 1;
        }
      }

      const neededMatches = lyricTokens.length === 1 ? 1 : Math.max(2, Math.ceil(lyricTokens.length * 0.65));
      if (matchedWords.size >= neededMatches) {
        alignedLineCount += 1;
        alignedTokenCount += matchedWords.size;
        alignedLines[lineIndex].words = parts.map((text, partIndex) => {
          const timing = matchedWords.get(partIndex);
          return timing ? { text, time: timing.time, endTime: timing.endTime } : { text, time: null, endTime: null };
        });
        transcriptCursor = Math.max(transcriptCursor, searchCursor);
      }
    });

    if (alignedLineCount < 3 || alignedTokenCount < 8 || alignedTokenCount / Math.max(1, lyricTokenCount) < 0.45) return null;
    return alignedLines;
  };

  const generateWordSync = async () => {
    const button = lyricsSyncButton();
    const track = currentLyrics.track || (window.Player && Player.currentTrack);
    if (!button || !track || currentLyrics.status !== 'line-synced' || currentLyrics.syncingWords) return;
    const syncState = currentLyrics;
    const wordSyncController = new AbortController();
    lyricsWordSyncController = wordSyncController;
    currentLyrics.syncingWords = true;
    currentLyrics.syncError = '';
    button.hidden = false;
    button.disabled = true;
    button.innerHTML = '<span class="lyrics-loader" aria-hidden="true"></span><span>Analyzing audio…</span>';
    button.title = 'Analyzing this audio stream for word timestamps.';
    setLyricsStatus('loading', 'Analyzing words');
    try {
      const languageMap = { hindi: 'hi', punjabi: 'pa', bengali: 'bn', tamil: 'ta', telugu: 'te', urdu: 'ur', marathi: 'mr', gujarati: 'gu', kannada: 'kn', malayalam: 'ml', english: 'en' };
      const rawLanguage = String(track.genre || '').trim().toLowerCase();
      const language = languageMap[rawLanguage] || (/^[a-z]{2}$/.test(rawLanguage) ? rawLanguage : '');
      const lyrics = lyricsTextForAlignment(currentLyrics.lines);
      const response = await fetch('/api/lyrics/word-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: track.audioUrl, title: track.title, artist: track.artist, language, duration: Number(track.duration) || 0, lyrics }),
        signal: wordSyncController.signal
      });
      if (currentLyrics !== syncState) return;
      const result = await response.json().catch(() => ({}));
      if (currentLyrics !== syncState) return;
      const apiError = typeof result.error === 'string' ? result.error : result.error && result.error.message;
      if (!response.ok) throw new Error(apiError || `Word sync failed (${response.status}).`);
      const aligned = alignLyricsToTranscriptWords(currentLyrics.lines, result.words, Player.getProgress().total || track.duration);
      if (!aligned) throw new Error('The audio words did not match these lyrics closely enough. Line sync is still active.');

      currentLyrics.lines = aligned;
      currentLyrics.hasWordSync = true;
      currentLyrics.status = 'word-synced';
      currentLyrics.lastActiveLine = -1;
      currentLyrics.lastActiveWord = -1;
      if (MusicData.saveLyricsWordSync) MusicData.saveLyricsWordSync(track.id, lyrics, aligned);
      setLyricsStatus('word-synced', 'Word synced');
      renderLyrics();
      updateLyricsScroll(Player.getProgress().current, Player.getProgress().total);
    } catch (error) {
      if ((error && error.name === 'AbortError') || currentLyrics !== syncState) return;
      currentLyrics.syncError = error.message || 'Word sync could not be generated. Line timing remains available.';
      setLyricsStatus('line-synced', 'Line synced');
      button.innerHTML = '<span class="lyrics-word-sync-icon" aria-hidden="true">✦</span><span>Try word sync again</span>';
    } finally {
      syncState.syncingWords = false;
      if (currentLyrics === syncState) {
        updateLyricsSyncAction();
        if (currentLyrics.hasWordSync) button.hidden = true;
        else button.disabled = false;
      }
      if (lyricsWordSyncController === wordSyncController) lyricsWordSyncController = null;
    }
  };

  const setLyricsStatus = (state, message) => {
    const status = document.getElementById('lyrics-sync-status');
    const label = document.getElementById('lyrics-sync-label');
    if (!status || !label) return;
    status.dataset.state = state;
    label.textContent = message;
    status.setAttribute('aria-label', message);
  };

  const lyricsMessage = (title, message, state = 'empty') => {
    const container = document.getElementById('lyrics-content');
    if (!container) return;
    container.innerHTML = `<div class="lyrics-state lyrics-state-${state}"><span class="lyrics-state-icon" aria-hidden="true">${state === 'loading' ? '<span class="lyrics-loader"></span>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 5h8M8 9h8M8 13h5M6 3h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke-linecap="round" stroke-linejoin="round"/></svg>'}</span><strong>${esc(title)}</strong><span>${esc(message)}</span></div>`;
  };

  const syncWordsButton = lyricsSyncButton();
  if (syncWordsButton) syncWordsButton.addEventListener('click', generateWordSync);
  document.addEventListener('server:config', updateLyricsSyncAction);

  const loadLyrics = async (track) => {
    if (lyricsRequestController) lyricsRequestController.abort();
    if (lyricsWordSyncController) lyricsWordSyncController.abort();
    lyricsWordSyncController = null;
    lyricsRequestController = new AbortController();
    const requestId = ++lyricsRequestId;
    currentLyrics = { lines: [], isSynced: false, hasWordSync: false, lastActiveLine: -1, lastActiveWord: -1, status: 'loading', trackId: track && track.id || null, track: track || null, syncingWords: false, syncError: '' };
    updateLyricsSyncAction();
    setLyricsStatus('loading', 'Loading lyrics');
    lyricsMessage('Finding the right lyrics', 'Checking this track against its title, artist, and duration.', 'loading');
    if (!track || !track.id) {
      currentLyrics.status = 'empty';
      setLyricsStatus('empty', 'No track');
      lyricsMessage('Nothing playing yet', 'Start a song to view its lyrics.');
      return;
    }

    try {
      const result = await MusicData.getSongLyrics(track.id, track, { signal: lyricsRequestController.signal });
      if (requestId !== lyricsRequestId) return;
      if (result && result.instrumental) {
        currentLyrics.status = 'instrumental';
        setLyricsStatus('plain', 'Instrumental');
        lyricsMessage('Instrumental track', 'There are no vocal lyrics to display.');
        return;
      }
      const parsedData = result && Array.isArray(result.lines)
        ? { lines: result.lines, isSynced: Boolean(result.isSynced), hasWordSync: Boolean(result.hasWordSync) }
        : parseLyrics(result && result.lyrics || '');
      if (!parsedData.lines.length) {
        currentLyrics.status = 'empty';
        setLyricsStatus('empty', 'Lyrics unavailable');
        lyricsMessage('Lyrics not available', 'We couldn’t find a reliable lyric match for this track.');
        return;
      }
      currentLyrics.lines = parsedData.lines;
      currentLyrics.isSynced = parsedData.isSynced;
      currentLyrics.hasWordSync = parsedData.hasWordSync;
      if (currentLyrics.isSynced && !currentLyrics.hasWordSync) {
        currentLyrics.lines = restoreCachedWordSync(track, currentLyrics.lines);
        currentLyrics.hasWordSync = currentLyrics.lines.some(line => Array.isArray(line.words) && line.words.some(word => Number.isFinite(word.time)));
      }
      currentLyrics.status = currentLyrics.isSynced ? (currentLyrics.hasWordSync ? 'word-synced' : 'line-synced') : 'plain';
      setLyricsStatus(currentLyrics.hasWordSync ? 'word-synced' : currentLyrics.isSynced ? 'line-synced' : 'plain',
        currentLyrics.hasWordSync ? 'Word synced' : currentLyrics.isSynced ? 'Line synced' : 'Lyrics only');
      updateLyricsSyncAction();
      renderLyrics();
      updateLyricsScroll(Player.getProgress().current, Player.getProgress().total);
    } catch (err) {
      if (requestId !== lyricsRequestId || (err && err.name === 'AbortError')) return;
      currentLyrics.status = 'error';
      setLyricsStatus('error', 'Could not load lyrics');
      lyricsMessage('Lyrics couldn’t load', 'Check your connection and try another track.', 'error');
    }
  };
  
  const renderLyrics = () => {
    const container = document.getElementById('lyrics-content');
    if (!container) return;

    container.innerHTML = currentLyrics.lines.map((lineObj, i) => {
      const words = Array.isArray(lineObj.words) ? lineObj.words : [];
      const hasTimedWords = words.some(word => Number.isFinite(word.time));
      const text = currentLyrics.hasWordSync && words.length
        ? words.map((word, wordIndex) => `<span class="lyric-word" data-word-index="${wordIndex}"${Number.isFinite(word.time) ? ` data-word-time="${word.time}"` : ''}>${esc(word.text)}</span>`).join('')
        : esc(lineObj.text);
      return `<div class="lyric-line${currentLyrics.isSynced ? ' is-timed' : ' is-untimed'}${hasTimedWords ? ' has-word-timing' : ''}" data-index="${i}"${Number.isFinite(lineObj.time) ? ` data-time="${lineObj.time}"` : ''}>${text || '&nbsp;'}</div>`;
    }).join('');
  };

  const updateLyricsScroll = (current, total) => {
    if (!currentLyrics.isSynced || !currentLyrics.lines.length) return;
    let currentLineIdx = -1;
    for (let i = 0; i < currentLyrics.lines.length; i++) {
      const lineTime = currentLyrics.lines[i].time;
      if (Number.isFinite(lineTime) && lineTime <= current) currentLineIdx = i;
      else if (Number.isFinite(lineTime) && lineTime > current) break;
    }

    const linesElements = document.querySelectorAll('.lyric-line');
    if (!linesElements.length) return;
    const lineChanged = currentLyrics.lastActiveLine !== currentLineIdx;
    if (lineChanged) {
      linesElements.forEach(line => {
        line.classList.remove('active');
        line.querySelectorAll('.lyric-word.active').forEach(word => word.classList.remove('active'));
      });
      currentLyrics.lastActiveLine = currentLineIdx;
      currentLyrics.lastActiveWord = -1;
      const activeLine = currentLineIdx >= 0 ? linesElements[currentLineIdx] : null;
      if (activeLine) {
        activeLine.classList.add('active');
        const scrollBox = document.getElementById('lyrics-scroll-box');
        if (scrollBox) {
          const offset = activeLine.offsetTop - (scrollBox.clientHeight / 2) + (activeLine.clientHeight / 2);
          scrollBox.scrollTo({ top: offset, behavior: 'smooth' });
        }
      }
    }

    const activeLine = currentLineIdx >= 0 ? currentLyrics.lines[currentLineIdx] : null;
    const wordIndex = activeLine && currentLyrics.hasWordSync
      ? activeLine.words.reduce((found, word, index) => Number.isFinite(word.time) && word.time <= current ? index : found, -1)
      : -1;
    if (wordIndex !== currentLyrics.lastActiveWord) {
      linesElements.forEach(line => line.querySelectorAll('.lyric-word.active').forEach(word => word.classList.remove('active')));
      if (currentLineIdx >= 0 && wordIndex >= 0) {
        const activeWord = linesElements[currentLineIdx].querySelector(`[data-word-index="${wordIndex}"]`);
        if (activeWord) activeWord.classList.add('active');
      }
      currentLyrics.lastActiveWord = wordIndex;
    }
  };
  // -------------------------

  const updateProgress = (current, total) => {
    const fill = document.querySelector('.progress-bar-fill');
    const fills = document.querySelectorAll('.progress-bar-fill, .player-mini-progress-fill');
    const curEl = document.querySelector('.player-time-current');
    const totEl = document.querySelector('.player-time-total');
    const fsCurEl = document.getElementById('fs-time-current');
    const fsTotEl = document.getElementById('fs-time-total');
    const pct = total ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;
    if (fills.length) {
      fills.forEach(el => { el.style.width = `${pct}%`; });
    }
    if (curEl) curEl.textContent = MusicData.formatDuration(current);
    if (totEl) totEl.textContent = MusicData.formatDuration(total);
    if (fsCurEl) fsCurEl.textContent = MusicData.formatDuration(current);
    if (fsTotEl) fsTotEl.textContent = MusicData.formatDuration(total);
      
    // Update lyrics auto-scroll
    updateLyricsScroll(current, total);
  };

  const updateVolumeUI = (vol) => {
    const fill = document.querySelector('.volume-bar-fill');
    if (fill) fill.style.width = `${vol * 100}%`;

    const volumeButton = document.querySelector('.volume-btn');
    if (volumeButton) {
      const isMuted = vol === 0;
      volumeButton.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
      volumeButton.setAttribute('aria-pressed', String(isMuted));
      volumeButton.title = isMuted ? 'Unmute' : 'Mute';
    }
    
    // Toggle volume icons
    const iconHigh = document.querySelector('.icon-volume-high');
    const iconMute = document.querySelector('.icon-volume-mute');
    if (iconHigh && iconMute) {
      if (vol === 0) {
        iconHigh.style.display = 'none';
        iconMute.style.display = 'block';
      } else {
        iconHigh.style.display = 'block';
        iconMute.style.display = 'none';
      }
    }
  };

  const setActiveNav = (viewName) => {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });
  };

  // ── Load Saavn search results (async, injected into DOM) ──
  const loadSaavnSearch = async (query) => {
    const container = document.getElementById('saavn-results-container');
    if (!container) return;

    // Show Spotify-style loading skeleton
    container.innerHTML = `
      <div class="saavn-loading-state">
        <div class="spotify-bar-loader">
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
        </div>
        <span class="loading-label">Searching Trending...</span>
      </div>
      ${renderTracksSkeleton(4)}
      <div style="margin-top: 16px">${renderCardsSkeleton(4)}</div>
    `;

    try {
      const results = await MusicData.searchSaavn(query);
      let html = '';

      if (results.tracks.length) {
        html += `<h3>Songs</h3><div class="track-list content-loaded">${results.tracks.map((t, i) => createTrackRow(t, i)).join('')}</div>`;
      }
      if (results.albums.length) {
        html += `<h3>Albums</h3><div class="cards-row content-loaded"><div class="cards-row-inner">${results.albums.map(a => createCard(a, 'album')).join('')}</div></div>`;
      }
      if (results.artists.length) {
        html += `<h3>Artists</h3><div class="cards-row content-loaded"><div class="cards-row-inner">${results.artists.map(a => createArtistCard(a)).join('')}</div></div>`;
      }

      if (!html) html = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <p>No results found for "<strong>${esc(query)}</strong>"</p>
          <p class="empty-hint">Check your spelling or try different keywords</p>
        </div>
      `;
      container.innerHTML = `<div class="content-loaded">${html}</div>`;
    } catch (err) {
      container.innerHTML = '<p class="empty-hint">Could not reach Trending</p>';
    }
  };

  // ── Render Search Dropdown (Live Search + recent songs) ────
  const renderRecentSongSearches = () => {
    const recentSongs = (MusicData.getRecentlySearched ? MusicData.getRecentlySearched() : [])
      .filter(item => item && item.id && (item.type === 'track' || item.audioUrl))
      .slice(0, 6);

    if (!recentSongs.length) {
      return '<div class="search-history-empty"><span class="search-history-empty-icon" aria-hidden="true">⌕</span><strong>No recent song searches</strong><span>Your searched songs will appear here.</span></div>';
    }

    return '<section class="search-dropdown-section search-history-section" role="group" aria-label="Recently searched songs">' +
      '<div class="search-dropdown-section-title"><span>Recently searched</span><span class="search-dropdown-count">' + recentSongs.length + '</span></div>' +
      recentSongs.map((track, index) => {
        const title = track.title || track.name || 'Untitled track';
        const subtitle = [track.artist, track.album].filter(Boolean).join(' · ');
        return '<div class="search-dropdown-item search-history-item" role="option" aria-selected="false" tabindex="-1" data-search-option="true" id="search-option-recent-' + index + '"' +
          ' data-search-history="true" data-action="play-track" data-track-id="' + esc(track.id) + '" data-track="' + esc(JSON.stringify(track)) + '">' +
          '<img class="search-dropdown-img" src="' + esc(track.coverUrl || track.imageUrl || '') + '" alt="" loading="lazy" onerror="this.src=\'https://picsum.photos/seed/recent-song/40/40\'">' +
          '<div class="search-dropdown-info"><span class="search-dropdown-title">' + esc(title) + '</span><span class="search-dropdown-subtitle">' + esc(subtitle || 'Song') + '</span></div>' +
          '<svg class="search-history-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg></div>';
      }).join('') + '</section>';
  };

  const renderSearchDropdown = (results, query = '') => {
    if (!String(query || '').trim()) return renderRecentSongSearches();
    if (!results) return '';

    const normalize = (value) => String(value || '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    const queryText = normalize(query);
    const queryTokens = queryText.split(/\s+/).filter(Boolean);
    if (!queryText) return '<div class="search-dropdown-status">Enter a song, artist, or album name to see matches.</div>';

    const scoreItem = (primary, secondary) => {
      const title = normalize(primary);
      const detail = normalize(secondary);
      const titleWords = title.split(/\s+/).filter(Boolean);
      const detailWords = detail.split(/\s+/).filter(Boolean);
      let score = 0;

      if (title === queryText) score += 160;
      else if (title.startsWith(queryText)) score += 125;
      else if (titleWords.some(word => word.startsWith(queryText))) score += 100;
      else if (title.includes(queryText)) score += 78;

      if (detail === queryText) score += 82;
      else if (detail.startsWith(queryText)) score += 66;
      else if (detailWords.some(word => word.startsWith(queryText))) score += 52;
      else if (detail.includes(queryText)) score += 34;

      let matchedTokens = 0;
      queryTokens.forEach((token) => {
        if (titleWords.includes(token)) {
          score += 18;
          matchedTokens += 1;
        } else if (titleWords.some(word => word.startsWith(token))) {
          score += 12;
          matchedTokens += 1;
        } else if (detailWords.includes(token)) {
          score += 9;
          matchedTokens += 1;
        } else if (detailWords.some(word => word.startsWith(token))) {
          score += 6;
          matchedTokens += 1;
        }
      });
      if (queryTokens.length && matchedTokens === queryTokens.length) score += 24;
      return score;
    };

    const rank = (items, primary, secondary) => (Array.isArray(items) ? items : [])
      .map((item, index) => ({ item, index, score: scoreItem(primary(item), secondary(item)) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(entry => entry.item);

    const highlight = (value) => {
      const text = String(value || '');
      const terms = String(query || '').trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
      const match = terms.map(term => {
        const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
        return index < 0 ? null : { index, length: term.length };
      }).find(Boolean);
      if (!match) return esc(text);
      return esc(text.slice(0, match.index)) +
        '<mark class="search-match">' + esc(text.slice(match.index, match.index + match.length)) + '</mark>' +
        esc(text.slice(match.index + match.length));
    };

    const tracks = rank(results.tracks, item => item.title, item => item.artist + ' ' + item.album).slice(0, 5);
    const albums = rank(results.albums, item => item.title, item => item.artist).slice(0, 3);
    const artists = rank(results.artists, item => item.name, () => '').slice(0, 3);
    const hasResults = tracks.length + albums.length + artists.length > 0;
    const section = (title, items, renderItem) => {
      if (!items.length) return '';
      return '<section class="search-dropdown-section" role="group" aria-label="' + title + '"><div class="search-dropdown-section-title" aria-hidden="true">' +
        '<span>' + title + '</span><span class="search-dropdown-count">' + items.length + '</span></div>' +
        items.map(renderItem).join('') + '</section>';
    };
    const optionAttrs = (type, index) =>
      ' role="option" aria-selected="false" tabindex="-1" data-search-option="true" id="search-option-' + type + '-' + index + '"';

    let html = '<div class="search-dropdown-summary">' +
      (hasResults ? 'Best matches, ranked by title and artist' :
        (results.unavailable ? 'Search is temporarily unavailable' : 'No close matches found')) +
      '</div>';

    const songsSection = () => section('Songs', tracks, (track, index) =>
      '<div class="search-dropdown-item"' + optionAttrs('song', index) +
      ' data-action="play-track" data-track-id="' + esc(track.id) + '" data-track="' + esc(JSON.stringify(track)) + '">' +
      '<img class="search-dropdown-img" src="' + esc(track.coverUrl) + '" alt="" loading="lazy" onerror="this.src=\'https://picsum.photos/seed/fallback/40/40\'">' +
      '<div class="search-dropdown-info"><span class="search-dropdown-title">' + highlight(track.title) +
      '</span><span class="search-dropdown-subtitle">' + highlight(track.artist) +
      (track.album ? ' · ' + esc(track.album) : '') + '</span></div></div>');

    const artistsSection = () => section('Artists', artists, (artist, index) =>
      '<div class="search-dropdown-item"' + optionAttrs('artist', index) +
      ' data-action="navigate" data-view="artist" data-id="' + esc(artist.id) + '">' +
      '<img class="search-dropdown-img round" src="' + esc(artist.imageUrl) + '" alt="" loading="lazy" onerror="this.src=\'https://picsum.photos/seed/fallback/40/40\'">' +
      '<div class="search-dropdown-info"><span class="search-dropdown-title">' + highlight(artist.name) +
      '</span><span class="search-dropdown-subtitle">Artist</span></div></div>');

    const albumsSection = () => section('Albums', albums, (album, index) =>
      '<div class="search-dropdown-item"' + optionAttrs('album', index) +
      ' data-action="navigate" data-view="album" data-id="' + esc(album.id) + '">' +
      '<img class="search-dropdown-img" src="' + esc(album.coverUrl) + '" alt="" loading="lazy" onerror="this.src=\'https://picsum.photos/seed/fallback/40/40\'">' +
      '<div class="search-dropdown-info"><span class="search-dropdown-title">' + highlight(album.title) +
      '</span><span class="search-dropdown-subtitle">Album · ' + highlight(album.artist) +
      '</span></div></div>');

    const relevantSections = [
      { score: tracks.length ? scoreItem(tracks[0].title, tracks[0].artist + ' ' + tracks[0].album) : -1, render: songsSection },
      { score: artists.length ? scoreItem(artists[0].name, '') : -1, render: artistsSection },
      { score: albums.length ? scoreItem(albums[0].title, albums[0].artist) : -1, render: albumsSection }
    ].filter(item => item.score >= 0).sort((a, b) => b.score - a.score);
    html += relevantSections.map(item => item.render()).join('');

    html += '<button type="button" class="search-dropdown-more"' + optionAttrs('all', 0) +
      ' data-action="search-all"><span>Search all results for <strong>' + esc(query) +
      '</strong></span><span class="search-dropdown-enter">Enter ↵</span></button>';
    return html;
  };


  // ── Public API ──────────────────────────────────────────────
  window.UI = {
    renderHome,
    renderHomeLoadingSkeleton,
    renderSearch,
    renderLibrary,
    renderLikedSongs,
    renderDownloadedSongs,
    renderPlaylist,
    renderAlbum,
    renderArtist,
    renderQueue,
    createCard,
    createArtistCard,
    createTrackRow,
    showToast,
    showContextMenu,
    updatePlayerUI,
    updatePlayPauseBtn,
    updateTransportState,
    updatePlaybackModeUI,
    updateProgress,
    updateVolumeUI,
    setActiveNav,
    showSkeleton,
    getGreeting,
    loadSaavnSearch,
    renderSearchDropdown,
    renderAlbumSkeleton,
    renderSearchDropdownLoading,
    renderCardsSkeleton,
    renderTracksSkeleton,
    GENRE_COLORS
  };
})();



