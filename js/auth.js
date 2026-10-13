/* ============================================================
   Aurafy Account & Firebase Real-Time Authentication
   Features:
   - Firebase Auth (Email/Password, Google OAuth Redirect)
   - Real-Time Auth State via onAuthStateChanged
   - Supabase Database Sync via Server API
   - Modern Horizontal Split-View Layout
   - In-App Firebase Project Configuration
   ============================================================ */
(function () {
  'use strict';

  const state = {
    user: null,
    firebaseApp: null,
    firebaseAuth: null,
    firebaseAuthStateReady: null,
    isFirebaseConnected: false,
    firebaseSetupPromise: null,
    syncing: false,
    syncEnabled: false,
    syncTimer: null,
    mode: 'signin',
    pendingGoogleAuthError: ''
  };

  const $ = (id) => document.getElementById(id);

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  };

  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const getGoogleAuthErrorMessage = (err) => {
    let message = err.message || 'Google sign-in failed. Please try again.';
    if (err.code === 'auth/unauthorized-domain') message = 'This site is not authorized in Firebase. Add its hostname under Authentication → Settings → Authorized domains.';
    if (err.code === 'auth/operation-not-allowed') message = 'Google sign-in is disabled for this Firebase project. Enable Google under Authentication → Sign-in method.';
    if (err.code === 'auth/web-storage-unsupported') message = 'Google sign-in needs browser storage. Enable cookies and site storage, then try again.';
    return message;
  };

  const showGoogleAuthError = (err) => {
    const errorMessage = getGoogleAuthErrorMessage(err);
    const message = $('account-message');
    if (message) {
      message.textContent = errorMessage;
      message.className = 'account-message account-message-error';
    } else {
      state.pendingGoogleAuthError = errorMessage;
    }
  };

  const formatFirebaseUser = (fbUser) => {
    if (!fbUser) return null;
    const providerId = (fbUser.providerData && fbUser.providerData[0] && fbUser.providerData[0].providerId) || 'password';
    return {
      id: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Music Lover'),
      avatar: fbUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fbUser.displayName || fbUser.email || 'User')}&background=8B5CF6&color=fff&size=160`,
      provider: providerId === 'google.com' ? 'google' : 'email',
      isFirebase: true
    };
  };

  const announce = () => {
    const button = $('account-button');
    if (button) {
      const label = $('account-button-label');
      if (label) {
        label.textContent = state.user ? (state.user.displayName || state.user.email?.split('@')[0] || 'Account') : 'Login';
      }
      button.setAttribute('aria-label', state.user ? `Account: ${state.user.email}` : 'Log in or create an account');
      button.classList.toggle('account-button-signed-in', Boolean(state.user));
      const existingAvatar = button.querySelector('.account-btn-avatar');
      if (state.user && state.user.avatar) {
        if (existingAvatar) {
          existingAvatar.src = state.user.avatar;
        } else {
          const img = document.createElement('img');
          img.className = 'account-btn-avatar';
          img.src = state.user.avatar;
          img.alt = 'Avatar';
          button.prepend(img);
          const svg = button.querySelector('.account-icon');
          if (svg) svg.style.display = 'none';
        }
      } else {
        if (existingAvatar) existingAvatar.remove();
        const svg = button.querySelector('.account-icon');
        if (svg) svg.style.display = '';
      }
    }
    const message = $('account-message');
    if (message && state.user) {
      message.textContent = `Signed in as ${state.user.email}. Library syncs automatically.`;
      message.className = 'account-message account-message-success';
    }
    document.dispatchEvent(new CustomEvent('auth:statechange', { detail: { user: state.user } }));
  };

  const setUser = (user) => {
    state.user = user || null;
    state.syncEnabled = Boolean(user);
    try {
      if (user) localStorage.setItem('aurafy_user', JSON.stringify(user));
      else localStorage.removeItem('aurafy_user');
    } catch (_) {}
    if (window.MusicData) window.MusicData.setActiveUser(state.user && state.user.id);
    announce();
  };

  // ── Library Sync via Server ────────────────────────────────
  const syncLibrary = async () => {
    if (!state.user || !state.syncEnabled || state.syncing || !navigator.onLine) return;
    state.syncing = true;
    try {
      const result = await request('/api/library');
      if (result.data && window.MusicData) window.MusicData.mergeUserLibrary(result.data);
      await request('/api/library', {
        method: 'PUT',
        body: JSON.stringify({ data: window.MusicData ? window.MusicData.exportUserLibrary() : {} })
      });
      document.dispatchEvent(new CustomEvent('library:synced'));
    } catch (error) {
      console.warn('[Auth] Library sync note:', error.message);
      document.dispatchEvent(new CustomEvent('library:syncerror', { detail: { message: error.message } }));
    } finally {
      state.syncing = false;
    }
  };

  const scheduleSync = () => {
    if (!state.user || !state.syncEnabled) return;
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(syncLibrary, 700);
  };

  const syncLibraryAfterLogin = async () => {
    try {
      const result = await request('/api/library');
      if (result.data && window.MusicData) window.MusicData.mergeUserLibrary(result.data);
      state.syncEnabled = true;
      await syncLibrary();
      document.dispatchEvent(new CustomEvent('library:profilechange'));
    } catch (error) {
      state.syncEnabled = true;
      console.warn('[Auth] Sync note:', error.message);
    }
  };

  // ── Create Server Session After Firebase Auth ──────────────
  const createServerSession = async (fbUser) => {
    if (!fbUser) return;
    try {
      const idToken = await fbUser.getIdToken();
      await request('/api/auth/firebase-session', {
        method: 'POST',
        body: JSON.stringify({ idToken })
      });
    } catch (e) {
      console.warn('[Auth] Server session note:', e.message);
    }
  };

  // ── Firebase Initialization ────────────────────────────────
  const initFirebase = (config) => {
    if (!window.firebase || !window.firebase.initializeApp) {
      console.warn('[Firebase] SDK not loaded.');
      return false;
    }
    const apiKey = (config.apiKey || '').trim();
    const authDomain = (config.authDomain || '').trim();
    const projectId = (config.projectId || '').trim();
    if (!apiKey || !authDomain || !projectId) {
      state.isFirebaseConnected = false;
      return false;
    }
    try {
      // Prevent double init
      if (state.firebaseApp) {
        try { state.firebaseApp.delete(); } catch (_) {}
      }
      state.firebaseApp = firebase.initializeApp({ apiKey, authDomain, projectId });
      state.firebaseAuth = firebase.auth();
      state.isFirebaseConnected = true;
      let resolveInitialAuthState;
      state.firebaseAuthStateReady = new Promise((resolve) => { resolveInitialAuthState = resolve; });

      // ── Real-Time Auth State Listener ──────────────────────
      state.firebaseAuth.onAuthStateChanged((fbUser) => {
        if (resolveInitialAuthState) {
          resolveInitialAuthState();
          resolveInitialAuthState = null;
        }
        console.log('[Firebase Auth]', fbUser ? fbUser.email : 'Signed out');
        if (fbUser) {
          const formatted = formatFirebaseUser(fbUser);
          setUser(formatted);
          if (['#login', '#signup'].includes(window.location.hash)) {
            window.location.hash = '#account';
          }
          // Show the Firebase profile immediately; do server verification and library sync in the background.
          createServerSession(fbUser).then(syncLibraryAfterLogin);
        } else if (state.user && state.user.isFirebase) {
          setUser(null);
        }
      }, (error) => {
        if (resolveInitialAuthState) {
          resolveInitialAuthState();
          resolveInitialAuthState = null;
        }
        console.warn('[Firebase Auth] Could not restore the current session:', error.message);
      });

      // Redirect sign-in returns to the app in a new page load. Read its result
      // once so Firebase can surface provider/configuration errors clearly.
      state.firebaseAuth.getRedirectResult().catch((err) => {
        console.warn('[Firebase Google Redirect]', err);
        showGoogleAuthError(err);
      });

      console.log('[Firebase] Initialized successfully.');
      return true;
    } catch (err) {
      console.warn('[Firebase] Init failed:', err.message);
      state.isFirebaseConnected = false;
      return false;
    }
  };

  // ── Switch Form Mode ───────────────────────────────────────
  const setMode = (mode) => {
    state.mode = mode;
    const isSignup = mode === 'signup';
    const nameGroup = $('account-name-group');
    const confirmGroup = $('account-confirm-group');
    const submit = $('account-submit');
    const loginTab = $('account-mode-signin');
    const signupTab = $('account-mode-signup');
    const eyebrow = $('auth-eyebrow');
    const title = $('account-title');
    const intro = $('account-intro');
    const switchPrompt = $('auth-switch-prompt');
    if (nameGroup) nameGroup.hidden = !isSignup;
    if (confirmGroup) confirmGroup.hidden = !isSignup;
    if (submit) submit.textContent = isSignup ? 'Create Free Account' : 'Log in to Aurafy';
    $('account-password')?.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
    if (eyebrow) eyebrow.textContent = isSignup ? 'JOIN AURAFY' : 'WELCOME BACK';
    if (title) title.textContent = isSignup ? 'Create your account' : 'Welcome back';
    if (intro) intro.textContent = isSignup
      ? 'Join free today to sync your playlists and liked songs everywhere.'
      : 'Sign in to access your synced music library and favorites.';
    if (loginTab) { loginTab.classList.toggle('active', !isSignup); loginTab.setAttribute('aria-selected', String(!isSignup)); }
    if (signupTab) { signupTab.classList.toggle('active', isSignup); signupTab.setAttribute('aria-selected', String(isSignup)); }
    if (switchPrompt) {
      switchPrompt.innerHTML = isSignup
        ? 'Already have an account? <a href="#login" class="auth-inline-switch">Log in</a>'
        : 'Don\'t have an account? <a href="#signup" class="auth-inline-switch">Sign up free</a>';
    }
    const message = $('account-message');
    if (message && !state.user) { message.textContent = ''; message.className = 'account-message'; }
  };

  // ── Render Auth Page ───────────────────────────────────────
  const renderPage = (route) => {
    // 1. Logged-in profile view
    if (state.user) {
      const isGoogle = state.user.provider === 'google';
      const userAvatar = state.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.displayName || state.user.email)}&background=8B5CF6&color=fff&size=160`;
      const displayName = state.user.displayName || state.user.email?.split('@')[0] || 'Music Lover';
      return `
        <section class="auth-page">
          <div class="auth-horizontal-wrapper auth-profile-wrapper">
            <div class="auth-showcase-panel auth-profile-showcase">
              <div class="auth-showcase-top">
                <a class="auth-brand" href="#home" aria-label="Aurafy home"><span class="auth-brand-mark">A</span><span>Aurafy</span></a>
                <span class="auth-verified-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  Verified Member
                </span>
              </div>
              <div class="auth-profile-avatar-wrap">
                <img src="${escapeHtml(userAvatar)}" alt="${escapeHtml(displayName)}" class="auth-profile-large-avatar" onerror="this.src='https://ui-avatars.com/api/?name=User&background=8B5CF6&color=fff'">
                ${isGoogle ? '<div class="auth-google-source-badge" title="Authenticated with Google"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg></div>' : ''}
              </div>
              <h2 class="auth-profile-name">${escapeHtml(displayName)}</h2>
              <p class="auth-profile-email-badge">${escapeHtml(state.user.email)}</p>
              <div class="auth-sync-status-card">
                <div class="auth-sync-indicator-pulse"></div>
                <div>
                  <div class="auth-sync-title">Cloud Sync Active</div>
                  <div class="auth-sync-sub">Playlists and likes sync instantly across your devices</div>
                </div>
              </div>
              <div class="auth-showcase-footer">
                <span>Signed in via ${isGoogle ? 'Google (Firebase)' : 'Firebase Auth'}</span>
              </div>
            </div>
            <div class="auth-form-panel auth-profile-controls">
              <div class="auth-form-top">
                <a class="auth-return" href="#home"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Back to Aurafy Player</a>
              </div>
              <div class="auth-card-inner">
                <p class="auth-eyebrow">YOUR PROFILE</p>
                <h1 id="account-title">Account Dashboard</h1>
                <p class="account-intro">Manage your cloud music library and session.</p>
                <div class="auth-stats-grid">
                  <div class="auth-stat-box"><span class="auth-stat-icon">❤️</span><span class="auth-stat-value" id="profile-likes-count">Active</span><span class="auth-stat-label">Liked Songs</span></div>
                  <div class="auth-stat-box"><span class="auth-stat-icon">🎵</span><span class="auth-stat-value" id="profile-playlists-count">Synced</span><span class="auth-stat-label">Playlists</span></div>
                  <div class="auth-stat-box"><span class="auth-stat-icon">✨</span><span class="auth-stat-value">Hi-Fi</span><span class="auth-stat-label">Lossless HD</span></div>
                </div>
                <div class="auth-action-buttons">
                  <a href="#home" class="btn btn-primary auth-btn-lg"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Continue Listening</a>
                  <button type="button" class="btn btn-secondary auth-btn-lg" id="btn-force-sync"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>Sync Library Now</button>
                  <button type="button" class="btn btn-danger-outline auth-btn-lg" id="account-signout"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>Sign out</button>
                </div>
              </div>
            </div>
          </div>
        </section>`;
    }

    // 2. Login / Signup form
    if (route === 'account') { window.location.hash = '#login'; route = 'login'; }
    const isSignup = route === 'signup';
    state.mode = isSignup ? 'signup' : 'signin';
    const pendingGoogleAuthError = state.pendingGoogleAuthError;
    state.pendingGoogleAuthError = '';

    return `
      <section class="auth-page auth-page-${isSignup ? 'signup' : 'login'}">
        <div class="auth-horizontal-wrapper">
          <div class="auth-showcase-panel">
            <div class="auth-showcase-top">
              <a class="auth-brand" href="#home" aria-label="Aurafy home"><span class="auth-brand-mark">A</span><span>Aurafy</span></a>
            </div>
            <div class="auth-showcase-hero">
              <h2 class="auth-showcase-heading">${isSignup ? 'Your next favorite<br><span class="gradient-text">starts here.</span>' : 'Your music,<br><span class="gradient-text">right where you left off.</span>'}</h2>
              <p class="auth-showcase-desc">${isSignup ? 'Create your free Aurafy account to save favorites, build playlists, and keep your listening in sync across devices.' : 'Sign in to keep your playlists and favorites close at hand, wherever you listen.'}</p>
              <div class="auth-features-list">
                <div class="auth-feature-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>${isSignup ? 'Save songs you love' : 'Your playlists and favorites'}</span></div>
                <div class="auth-feature-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><span>${isSignup ? 'Build playlists for your mood' : 'Discover something new'}</span></div>
                <div class="auth-feature-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg><span>${isSignup ? 'Pick up on any device' : 'Pick up on any device'}</span></div>
              </div>
            </div>
            <div class="auth-showcase-footer"><span>Aurafy · Music for every moment</span></div>
          </div>

          <div class="auth-form-panel">
            <div class="auth-form-top">
              <a class="auth-return" href="#home"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Back to Aurafy</a>
            </div>
            <div class="auth-card-inner">
              <div class="account-mode-switch" role="tablist" aria-label="Account Action">
                <a href="#login" class="${isSignup ? '' : 'active'}" id="account-mode-signin" role="tab" aria-selected="${!isSignup}">Log in</a>
                <a href="#signup" class="${isSignup ? 'active' : ''}" id="account-mode-signup" role="tab" aria-selected="${isSignup}">Sign up</a>
              </div>

              <div class="auth-titles-block">
                <span class="auth-brand-mark auth-mobile-mark" aria-hidden="true">A</span>
                <p class="auth-eyebrow" id="auth-eyebrow">${isSignup ? 'JOIN AURAFY' : 'WELCOME BACK'}</p>
                <h1 id="account-title">${isSignup ? 'Create your account' : 'Welcome back'}</h1>
                <p id="account-intro" class="account-intro">${isSignup ? 'Join free today to sync your playlists and liked songs everywhere.' : 'Sign in to access your synced music library and favorites.'}</p>
              </div>

              <button type="button" class="btn-google-auth" id="btn-google-auth" aria-label="Continue with Google">
                <svg class="google-svg-icon" viewBox="0 0 24 24" width="22" height="22">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <div class="auth-divider"><span>or continue with email</span></div>
              <div id="account-message" class="account-message${pendingGoogleAuthError ? ' account-message-error' : ''}" role="status" aria-live="polite">${escapeHtml(pendingGoogleAuthError)}</div>

              <form id="account-form" autocomplete="on">
                <label id="account-name-group" class="account-field" ${isSignup ? '' : 'hidden'}>
                  <span class="account-label-text"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Full Name</span>
                  <input id="account-display-name" name="name" type="text" placeholder="e.g. Alex Morgan" maxlength="80" autocomplete="name">
                </label>
                <label class="account-field">
                  <span class="account-label-text"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Email address</span>
                  <input id="account-email" name="email" type="email" placeholder="name@example.com" maxlength="254" autocomplete="username" required>
                </label>
                <label class="account-field">
                  <span class="account-label-text"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Password</span>
                  <div class="password-input-wrapper">
                    <input id="account-password" name="password" type="password" placeholder="••••••••" minlength="6" maxlength="128" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required>
                    <button type="button" class="btn-password-toggle" id="btn-password-toggle" title="Toggle password visibility">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </label>
                <label id="account-confirm-group" class="account-field" ${isSignup ? '' : 'hidden'}>
                  <span class="account-label-text"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Confirm password</span>
                  <input id="account-password-confirm" name="password-confirm" type="password" placeholder="••••••••" minlength="6" maxlength="128" autocomplete="new-password">
                </label>
                <label class="account-merge-choice" ${isSignup ? '' : 'hidden'}><input id="account-merge-library" type="checkbox" checked><span>Sync current playlists & liked songs into this account</span></label>
                <button class="btn btn-primary account-submit" id="account-submit" type="submit">${isSignup ? 'Create Free Account' : 'Log in to Aurafy'}</button>
              </form>

              <p class="auth-switch-prompt" id="auth-switch-prompt">${isSignup ? 'Already have an account? <a href="#login" class="auth-inline-switch">Log in</a>' : 'Don\'t have an account? <a href="#signup" class="auth-inline-switch">Sign up free</a>'}</p>
              <p class="auth-legal-note">By continuing, you agree to Aurafy's <a href="#">Terms of Service</a> & <a href="#">Privacy Policy</a>.</p>
            </div>
          </div>
        </div>
      </section>`;
  };

  // ── Password Toggle ────────────────────────────────────────
  const setupPasswordToggle = () => {
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('#btn-password-toggle');
      if (!toggle) return;
      const pwd = $('account-password');
      if (!pwd) return;
      const isPwd = pwd.type === 'password';
      pwd.type = isPwd ? 'text' : 'password';
      toggle.innerHTML = isPwd
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  };

  // ── Google Auth (Firebase full-page redirect) ───────────────
  const openGoogleAuthFlow = async () => {
    const message = $('account-message');
    const googleBtn = $('btn-google-auth');
    const googleLabel = googleBtn?.querySelector('span');
    const originalLabel = googleLabel?.textContent || 'Continue with Google';
    if (googleBtn?.disabled) return;

    // Start feedback synchronously so it is visible while Firebase initializes
    // as well as while the Google popup is being prepared.
    if (googleBtn) {
      googleBtn.disabled = true;
      googleBtn.classList.add('is-loading');
      googleBtn.setAttribute('aria-busy', 'true');
    }
    if (googleLabel) googleLabel.textContent = 'Opening Google…';
    if (message) { message.textContent = ''; message.className = 'account-message'; }

    try {
      if (state.firebaseSetupPromise) await state.firebaseSetupPromise;
      if (!state.isFirebaseConnected || !state.firebaseAuth) {
        throw new Error(!window.firebase || !window.firebase.auth
          ? 'Firebase sign-in could not load. Check your internet connection and reload.'
          : 'Google sign-in is not configured yet. Add your Firebase web app settings to the server .env file.');
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      await state.firebaseAuth.signInWithRedirect(provider);
      // The browser returns to Aurafy after Google sign-in; the auth-state
      // listener restores the profile and routes to the account page.
    } catch (err) {
      console.warn('[Firebase Google Auth]', err);
      showGoogleAuthError(err);
    } finally {
      if (googleBtn) {
        googleBtn.disabled = false;
        googleBtn.classList.remove('is-loading');
        googleBtn.removeAttribute('aria-busy');
      }
      if (googleLabel?.isConnected) googleLabel.textContent = originalLabel;
    }
  };

  // ── Email / Password Auth ──────────────────────────────────
  const submitForm = async (event) => {
    event.preventDefault();
    const email = ($('account-email')?.value || '').trim();
    const password = $('account-password')?.value || '';
    const confirmPassword = $('account-password-confirm')?.value || '';
    const displayName = ($('account-display-name')?.value || '').trim();
    const submit = $('account-submit');
    const message = $('account-message');

    if (state.mode === 'signup' && password !== confirmPassword) {
      if (message) { message.textContent = 'Passwords do not match.'; message.className = 'account-message account-message-error'; }
      $('account-password-confirm')?.focus();
      return;
    }
    if (submit) submit.disabled = true;
    if (message) { message.textContent = state.mode === 'signup' ? 'Creating account…' : 'Signing in…'; message.className = 'account-message account-message-loading'; }

    // 1. Firebase Auth
    if (state.isFirebaseConnected && state.firebaseAuth) {
      try {
        if (state.mode === 'signup') {
          const cred = await state.firebaseAuth.createUserWithEmailAndPassword(email, password);
          if (displayName && cred.user) {
            await cred.user.updateProfile({ displayName });
          }
          // onAuthStateChanged handles the rest
          if (message) { message.textContent = `Welcome to Aurafy, ${displayName || email}!`; message.className = 'account-message account-message-success'; }
        } else {
          await state.firebaseAuth.signInWithEmailAndPassword(email, password);
          // onAuthStateChanged handles the rest
        }
      } catch (err) {
        let msg = err.message || 'Authentication error.';
        if (err.code === 'auth/user-not-found') msg = 'No account found. Please sign up first.';
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'Incorrect password. Please try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered. Please log in.';
        if (err.code === 'auth/weak-password') msg = 'Password must be at least 6 characters.';
        if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
        if (message) { message.textContent = msg; message.className = 'account-message account-message-error'; }
      } finally {
        if (submit) submit.disabled = false;
      }
      return;
    }

    // 2. Server-only fallback (no Firebase configured)
    try {
      const result = await request(state.mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin', {
        method: 'POST', body: JSON.stringify({ email, password, displayName })
      });
      if (!result.user) { if (message) { message.textContent = 'Check your email to confirm.'; message.className = 'account-message account-message-info'; } return; }
      setUser(result.user);
      if (message) { message.textContent = `Welcome, ${result.user.displayName || result.user.email}!`; message.className = 'account-message account-message-success'; }
      await syncLibraryAfterLogin();
      setTimeout(() => { window.location.hash = '#account'; }, 400);
    } catch (error) {
      if (message) { message.textContent = error.message; message.className = 'account-message account-message-error'; }
    } finally {
      if (submit) submit.disabled = false;
    }
  };

  // ── Sign Out ───────────────────────────────────────────────
  const signOut = async () => {
    const button = $('account-signout');
    if (button) button.disabled = true;
    try {
      if (state.firebaseAuth) await state.firebaseAuth.signOut();
      await request('/api/auth/signout', { method: 'POST', body: '{}' }).catch(() => {});
    } catch (error) {
      console.warn('[Auth] Sign out note:', error.message);
    }
    setUser(null);
    setMode('signin');
    window.location.hash = '#home';
    document.dispatchEvent(new CustomEvent('library:profilechange'));
    if (button) button.disabled = false;
  };

  // ── Init ───────────────────────────────────────────────────
  const init = async () => {
    $('account-button')?.addEventListener('click', () => { window.location.hash = state.user ? '#account' : '#login'; });
    document.addEventListener('submit', (event) => { if (event.target.id === 'account-form') submitForm(event); });
    document.addEventListener('click', (event) => {
      if (event.target.closest('#account-signout')) signOut();
      if (event.target.closest('#btn-google-auth')) openGoogleAuthFlow();
      if (event.target.closest('#btn-force-sync')) {
        const btn = event.target.closest('#btn-force-sync');
        btn.disabled = true; btn.textContent = 'Syncing…';
        syncLibrary().finally(() => { btn.disabled = false; btn.textContent = 'Synced! ✓'; setTimeout(() => { btn.textContent = 'Sync Library Now'; }, 2000); });
      }
    });
    document.addEventListener('library:changed', scheduleSync);
    window.addEventListener('online', scheduleSync);
    setupPasswordToggle();

    // Restore cached user
    try {
      const cached = localStorage.getItem('aurafy_user');
      if (cached) { const user = JSON.parse(cached); if (user && user.email) setUser(user); }
    } catch (_) {}

    // Get server config
    state.firebaseSetupPromise = (async () => {
      let firebaseApiKey = '', firebaseAuthDomain = '', firebaseProjectId = '';
      try {
        const config = await request('/api/config');
        firebaseApiKey = config.firebaseApiKey || '';
        firebaseAuthDomain = config.firebaseAuthDomain || '';
        firebaseProjectId = config.firebaseProjectId || '';
      } catch (_) {}

      // Init Firebase if configured
      if (firebaseApiKey && firebaseAuthDomain && firebaseProjectId) {
        initFirebase({ apiKey: firebaseApiKey, authDomain: firebaseAuthDomain, projectId: firebaseProjectId });
      } else {
        // Try server session fallback
        try {
          const session = await request('/api/auth/session');
          if (session && session.user) { setUser(session.user); await syncLibraryAfterLogin(); }
        } catch (_) {}
        announce();
      }
    })();
    await state.firebaseSetupPromise;
  };

  window.AuthManager = {
    init,
    renderPage,
    get user() { return state.user; },
    get isFirebaseConnected() { return state.isFirebaseConnected; },
    async getFirebaseIdToken() {
      const auth = state.firebaseAuth;
      if (!auth) return '';
      if (!auth.currentUser && state.firebaseAuthStateReady) {
        await Promise.race([
          state.firebaseAuthStateReady,
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
      }
      const currentUser = auth.currentUser;
      return currentUser ? currentUser.getIdToken() : '';
    },
    signOut,
    openGoogleAuthFlow
  };
})();
