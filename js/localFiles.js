/* ============================================================
   Pulse Music — localFiles.js
   Local File Import, ID3 Parsing & IndexedDB Persistence
   ============================================================ */
(function () {
  'use strict';

  const DB_NAME = 'PulseMusicDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'localTracks';
  const DOWNLOAD_STORE_NAME = 'offlineDownloads';
  const MAX_DOWNLOAD_BYTES = 75 * 1024 * 1024;

  let db = null;

  // ── IndexedDB helpers ───────────────────────────────────────
  const openDB = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(DOWNLOAD_STORE_NAME)) {
        database.createObjectStore(DOWNLOAD_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(db); };
    request.onerror = (e) => { console.error('[LocalFiles] IndexedDB error:', e); reject(e); };
  });

  const dbPut = (track) => new Promise((resolve, reject) => {
    if (!db) { resolve(); return; }
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Keep imported audio on this device so blob URLs can be recreated after reload.
    const meta = { ...track, audioUrl: '', coverUrl: '', fileBlob: track.fileBlob || null, coverBlob: track.coverBlob || null };
    store.put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });

  const dbGetAll = () => new Promise((resolve, reject) => {
    if (!db) { resolve([]); return; }
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e);
  });

  const dbGetDownloads = () => new Promise((resolve, reject) => {
    if (!db || !db.objectStoreNames.contains(DOWNLOAD_STORE_NAME)) return resolve([]);
    const request = db.transaction(DOWNLOAD_STORE_NAME, 'readonly').objectStore(DOWNLOAD_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const dbPutDownload = (record) => new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Local storage is unavailable.'));
    const transaction = db.transaction(DOWNLOAD_STORE_NAME, 'readwrite');
    transaction.objectStore(DOWNLOAD_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save this download.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not save this download.'));
  });

  const dbDeleteDownload = (id) => new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Local storage is unavailable.'));
    const transaction = db.transaction(DOWNLOAD_STORE_NAME, 'readwrite');
    transaction.objectStore(DOWNLOAD_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove this download.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not remove this download.'));
  });

  // ── ID3v2 Tag Parser (basic implementation) ─────────────────
  const parseID3 = (arrayBuffer) => {
    const dv = new DataView(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    const result = { title: '', artist: '', album: '', coverData: null, coverMime: '' };

    // Check for ID3v2 header: "ID3"
    if (dv.byteLength < 10) return result;
    const header = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2));
    if (header !== 'ID3') return result;

    const version = dv.getUint8(3); // major version (3 = ID3v2.3, 4 = ID3v2.4)
    // const revision = dv.getUint8(4);
    // const flags = dv.getUint8(5);

    // Synchsafe integer for tag size
    const tagSize = (dv.getUint8(6) << 21) | (dv.getUint8(7) << 14) |
                    (dv.getUint8(8) << 7)  | dv.getUint8(9);

    let offset = 10;
    const end = Math.min(10 + tagSize, dv.byteLength);

    const readFrameSize = (off) => {
      if (version === 4) {
        // ID3v2.4 uses synchsafe
        return (dv.getUint8(off) << 21) | (dv.getUint8(off + 1) << 14) |
               (dv.getUint8(off + 2) << 7) | dv.getUint8(off + 3);
      }
      // ID3v2.3 uses regular integer
      return (dv.getUint8(off) << 24) | (dv.getUint8(off + 1) << 16) |
             (dv.getUint8(off + 2) << 8) | dv.getUint8(off + 3);
    };

    const readTextFrame = (off, size) => {
      if (size < 2) return '';
      const encoding = dv.getUint8(off);
      let text = '';
      if (encoding === 0 || encoding === 3) {
        // ISO-8859-1 or UTF-8
        const bytes = new Uint8Array(arrayBuffer, off + 1, size - 1);
        text = decoder.decode(bytes);
      } else if (encoding === 1 || encoding === 2) {
        // UTF-16
        let start = off + 1;
        let len = size - 1;
        // Skip BOM
        if (len >= 2) {
          const bom = dv.getUint16(start);
          if (bom === 0xFEFF || bom === 0xFFFE) {
            start += 2;
            len -= 2;
          }
        }
        const u16 = new Uint16Array(arrayBuffer.slice(start, start + len));
        text = String.fromCharCode(...u16);
      }
      // Remove null terminators
      return text.replace(/\0/g, '').trim();
    };

    while (offset < end - 10) {
      const frameId = String.fromCharCode(
        dv.getUint8(offset), dv.getUint8(offset + 1),
        dv.getUint8(offset + 2), dv.getUint8(offset + 3)
      );

      if (frameId === '\0\0\0\0' || frameId.charCodeAt(0) === 0) break;

      const frameSize = readFrameSize(offset + 4);
      // const frameFlags = dv.getUint16(offset + 8);
      const frameDataOffset = offset + 10;

      if (frameSize <= 0 || frameDataOffset + frameSize > end) break;

      switch (frameId) {
        case 'TIT2': result.title = readTextFrame(frameDataOffset, frameSize); break;
        case 'TPE1': result.artist = readTextFrame(frameDataOffset, frameSize); break;
        case 'TALB': result.album = readTextFrame(frameDataOffset, frameSize); break;
        case 'APIC': {
          // Extract embedded album art
          try {
            const encoding = dv.getUint8(frameDataOffset);
            let pos = frameDataOffset + 1;
            // Read MIME type (null-terminated)
            let mime = '';
            while (pos < frameDataOffset + frameSize && dv.getUint8(pos) !== 0) {
              mime += String.fromCharCode(dv.getUint8(pos));
              pos++;
            }
            pos++; // skip null
            pos++; // skip picture type byte
            // Skip description (null-terminated, encoding-dependent)
            if (encoding === 0 || encoding === 3) {
              while (pos < frameDataOffset + frameSize && dv.getUint8(pos) !== 0) pos++;
              pos++;
            } else {
              while (pos < frameDataOffset + frameSize - 1) {
                if (dv.getUint8(pos) === 0 && dv.getUint8(pos + 1) === 0) { pos += 2; break; }
                pos += 2;
              }
            }
            const imgData = new Uint8Array(arrayBuffer, pos, frameDataOffset + frameSize - pos);
            result.coverData = imgData;
            result.coverMime = mime || 'image/jpeg';
          } catch (_) { /* ignore cover parse failure */ }
          break;
        }
      }

      offset += 10 + frameSize;
    }

    return result;
  };

  // ── Public API ──────────────────────────────────────────────
  const LocalFiles = {

    async init() {
      document.addEventListener('library:profilechange', () => {
        LocalFiles.loadFromStorage();
        LocalFiles.loadDownloadsForUser();
      });
      try {
        await openDB();
        await LocalFiles.loadFromStorage();
        await LocalFiles.loadDownloadsForUser();
      } catch (err) {
        console.warn('[LocalFiles] Init error:', err);
      }

      // Set up drag & drop
      const dropZone = document.querySelector('.drop-zone');
      if (!dropZone) return;

      document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          LocalFiles.showDropZone();
        }
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (e.target === dropZone) LocalFiles.hideDropZone();
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        LocalFiles.hideDropZone();
        if (e.dataTransfer.files.length) {
          LocalFiles.handleFiles(e.dataTransfer.files);
        }
      });

      console.log('[LocalFiles] Initialised');
    },

    async handleFiles(fileList) {
      const audioFiles = Array.from(fileList).filter(f =>
        f.type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|flac|aac|wma)$/i.test(f.name)
      );

      if (!audioFiles.length) {
        if (window.UI) UI.showToast('No audio files detected.');
        return;
      }

      let importedCount = 0;
      let savedCount = 0;

      for (const file of audioFiles) {
        let track = null;
        try {
          const metadata = await LocalFiles.parseMetadata(file);
          track = LocalFiles.createTrackFromFile(file, metadata);
          track.profileId = window.MusicData && MusicData.activeUserId || 'guest';
          window.MusicData.addLocalTrack(track);
          importedCount++;
          await dbPut(track);
          savedCount++;
        } catch (err) {
          console.error('[LocalFiles] Error importing file:', file.name, err);
          if (!track && window.UI) UI.showToast(`Could not import ${file.name}.`);
        }
      }

      if (importedCount > 0) {
        if (window.UI) {
          const persistenceNote = savedCount < importedCount ? ' Some files may need to be imported again after closing the app.' : '';
          UI.showToast(`Imported ${importedCount} track${importedCount > 1 ? 's' : ''}.${persistenceNote}`);
        }
        document.dispatchEvent(new CustomEvent('localfiles:updated'));
      }
    },

    async parseMetadata(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const buffer = e.target.result;
          const tags = parseID3(buffer);
          resolve({
            title: tags.title || file.name.replace(/\.[^/.]+$/, ''),
            artist: tags.artist || 'Unknown Artist',
            album: tags.album || 'Unknown Album',
            coverData: tags.coverData,
            coverMime: tags.coverMime
          });
        };
        reader.onerror = () => {
          resolve({
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            coverData: null,
            coverMime: ''
          });
        };
        reader.readAsArrayBuffer(file);
      });
    },

    createTrackFromFile(file, metadata) {
      const audioUrl = URL.createObjectURL(file);
      let coverUrl = 'https://picsum.photos/seed/localfile/300/300';
      let coverBlob = null;

      if (metadata.coverData && metadata.coverMime) {
        coverBlob = new Blob([metadata.coverData], { type: metadata.coverMime });
        coverUrl = URL.createObjectURL(coverBlob);
      }

      return {
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        title: metadata.title,
        artist: metadata.artist,
        artistId: '',
        album: metadata.album,
        albumId: '',
        duration: 0, // will be updated when audio loads
        coverUrl,
        fileBlob: file,
        coverBlob,
        audioUrl,
        source: 'local',
        genre: ''
      };
    },

    getLocalTracks() {
      return window.MusicData ? MusicData.getLocalTracks() : [];
    },

    async toggleTrackDownload(track) {
      if (!track || !track.id) throw new Error('This track is not available for download.');
      const userId = window.MusicData && MusicData.activeUserId || 'guest';
      const recordId = `${userId}:${track.id}`;
      const existing = MusicData.getDownloadedSongs().find(item => item.id === track.id);
      if (existing) {
        await dbDeleteDownload(recordId);
        MusicData.toggleDownloaded(existing);
        if (existing.audioUrl && existing.audioUrl.startsWith('blob:')) URL.revokeObjectURL(existing.audioUrl);
        return false;
      }

      let audioBlob = track.fileBlob || null;
      if (!audioBlob) {
        if (!track.audioUrl) throw new Error('This track has no downloadable audio source.');
        const response = await fetch(track.audioUrl);
        if (!response.ok) throw new Error(`Download failed (${response.status}).`);
        audioBlob = await response.blob();
      }
      if (!audioBlob || !audioBlob.size) throw new Error('The audio source returned an empty file.');
      if (audioBlob.size > MAX_DOWNLOAD_BYTES) throw new Error('This file is larger than the 75 MB offline limit.');

      const storedTrack = { ...track };
      delete storedTrack.fileBlob;
      delete storedTrack.coverBlob;
      delete storedTrack.downloadBlob;
      storedTrack.audioUrl = '';
      await dbPutDownload({ id: recordId, userId, track: storedTrack, audioBlob });
      const offlineTrack = {
        ...storedTrack,
        audioUrl: URL.createObjectURL(audioBlob),
        downloadBlob: audioBlob,
        source: track.source || 'offline'
      };
      MusicData.toggleDownloaded(offlineTrack);
      return true;
    },

    downloadTrackToDevice(track, audioBlob) {
      if (!track || !audioBlob || !audioBlob.size) {
        throw new Error('The audio file is not ready to download.');
      }

      const safeName = (value) => String(value || '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
      const baseName = [safeName(track.artist), safeName(track.title || track.name)]
        .filter(Boolean)
        .join(' - ') || 'Aurafy track';
      const mime = String(audioBlob.type || '').toLowerCase().split(';')[0];
      const mimeExtensions = {
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a',
        'audio/aac': 'aac',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/flac': 'flac',
        'audio/webm': 'webm'
      };
      let extension = mimeExtensions[mime];
      if (!extension && track.audioUrl) {
        try {
          const urlExtension = new URL(track.audioUrl, window.location.href).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
          if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'webm', 'mp4'].includes(urlExtension)) {
            extension = urlExtension;
          }
        } catch (_) { /* Use the MIME fallback below. */ }
      }
      extension = extension || 'mp3';

      const objectUrl = URL.createObjectURL(audioBlob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${baseName}.${extension}`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return true;
    },

    async downloadTrack(track) {
      if (!track || !track.id) throw new Error('This track is not available for download.');
      const existing = MusicData.getDownloadedSongs().find(item => item.id === track.id);
      if (existing) {
        await LocalFiles.toggleTrackDownload(existing);
        return { added: false, removed: true, deviceDownloadStarted: false };
      }

      const added = await LocalFiles.toggleTrackDownload(track);
      if (!added) return { added: false, removed: true, deviceDownloadStarted: false };

      const savedTrack = MusicData.getDownloadedSongs().find(item => item.id === track.id);
      const audioBlob = savedTrack && savedTrack.downloadBlob || track.fileBlob;
      try {
        LocalFiles.downloadTrackToDevice(savedTrack || track, audioBlob);
        return { added: true, removed: false, deviceDownloadStarted: true };
      } catch (error) {
        return { added: true, removed: false, deviceDownloadStarted: false, error };
      }
    },

    async loadDownloadsForUser() {
      if (!window.MusicData) return;
      try {
        const userId = MusicData.activeUserId || 'guest';
        const records = await dbGetDownloads();
        let restored = 0;
        records.filter(record => record.userId === userId && record.track && record.audioBlob).forEach(record => {
          const track = MusicData.getDownloadedSongs().find(item => item.id === record.track.id) || record.track;
          if (track.audioUrl && track.audioUrl.startsWith('blob:')) URL.revokeObjectURL(track.audioUrl);
          const offlineTrack = {
            ...track,
            audioUrl: URL.createObjectURL(record.audioBlob),
            downloadBlob: record.audioBlob,
            source: record.track.source || 'offline'
          };
          MusicData.restoreDownloadedTrack(offlineTrack);
          restored++;
        });
        if (restored) document.dispatchEvent(new CustomEvent('localfiles:updated'));
      } catch (err) {
        console.warn('[LocalFiles] Failed to restore offline downloads:', err);
      }
    },

    async saveToStorage() {
      const locals = LocalFiles.getLocalTracks();
      for (const track of locals) {
        await dbPut(track);
      }
    },

    async loadFromStorage() {
      try {
        if (!window.MusicData) return;
        const userId = MusicData.activeUserId || 'guest';
        const allStored = await dbGetAll();
        const stored = allStored.filter(track => (track.profileId || 'guest') === userId);
        const restoredTracks = stored.map(t => {
            // Object URLs expire when the page closes; recreate them from IndexedDB blobs.
            t.audioUrl = t.fileBlob ? URL.createObjectURL(t.fileBlob) : '';
            t.coverUrl = t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || 'https://picsum.photos/seed/localfile/300/300');
            return t;
        });
        MusicData.setLocalTracks(restoredTracks);
        if (restoredTracks.length || allStored.length) console.log(`[LocalFiles] Restored ${stored.length} local tracks for this profile`);
        document.dispatchEvent(new CustomEvent('localfiles:updated'));
      } catch (err) {
        console.warn('[LocalFiles] Failed to load from storage:', err);
      }
    },

    showDropZone() {
      const dz = document.querySelector('.drop-zone');
      if (dz) dz.classList.add('active');
    },

    hideDropZone() {
      const dz = document.querySelector('.drop-zone');
      if (dz) dz.classList.remove('active');
    }
  };

  window.LocalFiles = LocalFiles;
})();
