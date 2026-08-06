/* ============ account, profiles and sign-in ============

   Read this before assuming what sign-in does here, because the honest answer
   is narrower than the button suggests.

   There is no server. This app is one static file. That has hard consequences:

     * PROFILES ARE LOCAL. Multiple named saves live side by side in this
       browser's localStorage. They do not leave the device.
     * A BACKUP CODE is the only real portability: your save, deflated and
       base64'd, which you paste into another browser.
     * GOOGLE SIGN-IN IS IDENTITY ONLY, AND NOT AUTHENTICATION. Google
       Identity Services can render its real button and hand back a signed ID
       token entirely client-side, so the name and email are genuine — but with
       no backend the signature cannot be verified, so it proves nothing and is
       therefore allowed to gate nothing. It also cannot sync anything: an ID
       token grants no storage.
     * IT NEEDS YOUR OWN OAUTH CLIENT ID. There is no shared one to ship, and
       Google requires the exact serving origin to be registered. So sign-in
       stays dormant until you paste a Client ID, and the setup card says so.
     * It cannot work from file:// at all (origin is null).

   Cross-device sync would need either a backend or Drive's appDataFolder with a
   sensitive OAuth scope. Neither fits a single static file, so neither is
   pretended at here.                                                        */
'use strict';

const Account = (() => {
  const PROFILE_KEY = 'hourling-profiles';
  const CLIENT_KEY = 'hourling-google-client';
  const GIS_SRC = 'https://accounts.google.com/gsi/client';

  /* ---------------- local profiles ---------------- */
  function meta() {
    let m;
    try { m = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) { m = null; }
    if (!m || typeof m !== 'object' || !Array.isArray(m.list)) {
      // adopt whatever save already exists as the first profile, so an
      // existing player never sees an empty account screen
      m = { list: [{ id: 'p1', name: 'Player 1', key: SAVE_KEY }], active: 'p1', google: null };
    }
    return m;
  }
  function writeMeta(m) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function profiles() { return meta().list; }
  function activeId() { return meta().active; }
  function active() {
    const m = meta();
    return m.list.find(p => p.id === m.active) || m.list[0];
  }

  function rename(id, name) {
    name = String(name || '').trim().slice(0, 24);
    if (!name) return false;
    const m = meta();
    const p = m.list.find(x => x.id === id);
    if (!p) return false;
    p.name = name;
    writeMeta(m);
    return true;
  }

  function create(name) {
    const m = meta();
    if (m.list.length >= 4) { toast('Four profiles is the limit'); return false; }
    let n = 2;
    while (m.list.some(p => p.id === 'p' + n)) n++;
    const id = 'p' + n;
    m.list.push({ id, name: String(name || '').trim().slice(0, 24) || 'Player ' + n,
                  key: 'dreamkeep-save-' + id });
    writeMeta(m);
    return id;
  }

  /* switching writes the live state out, then reloads against the other key */
  function switchTo(id) {
    const m = meta();
    const p = m.list.find(x => x.id === id);
    if (!p || id === m.active) return false;
    save();
    m.active = id;
    writeMeta(m);
    location.reload();
    return true;
  }

  function remove(id) {
    const m = meta();
    if (m.list.length <= 1) { toast('That is your only profile'); return false; }
    const p = m.list.find(x => x.id === id);
    if (!p) return false;
    try { localStorage.removeItem(p.key); } catch (e) {}
    m.list = m.list.filter(x => x.id !== id);
    if (m.active === id) { m.active = m.list[0].id; writeMeta(m); location.reload(); return true; }
    writeMeta(m);
    return true;
  }

  /* which localStorage key the game should read/write — called by state.js */
  function saveKey() {
    const p = active();
    return (p && p.key) || 'dreamkeep-save-v4';
  }

  /* ---------------- backup codes ----------------
     A save is ~17KB of JSON. Gzipped through the platform's own
     CompressionStream it lands near 3KB of base64, which is short enough to
     paste into a message; without CompressionStream we fall back to plain
     base64 and the code is simply longer. Both are marked so import knows
     which it is reading. */
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  async function gzip(u8) {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter();
    w.write(u8); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  async function gunzip(u8) {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(u8); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  async function exportCode() {
    const bytes = new TextEncoder().encode(JSON.stringify(S));
    if (typeof CompressionStream === 'function') {
      try { return 'HLZ1.' + b64(await gzip(bytes)); } catch (e) {}
    }
    return 'HLR1.' + b64(bytes);
  }

  async function importCode(code) {
    try {
      code = String(code || '').trim().replace(/\s+/g, '');
      const gz = code.indexOf('HLZ1.') === 0;
      const raw = code.indexOf('HLR1.') === 0;
      if (!gz && !raw) throw new Error('not a backup code');
      let bytes = unb64(code.slice(5));
      if (gz) bytes = await gunzip(bytes);
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || typeof data !== 'object' || !data.player) throw new Error('not a save');
      localStorage.setItem(saveKey(), JSON.stringify(data));
      return true;
    } catch (e) {
      toast('That code did not read as a backup');
      return false;
    }
  }

  /* ---------------- Google sign-in ---------------- */
  function clientId() {
    try { return localStorage.getItem(CLIENT_KEY) || ''; } catch (e) { return ''; }
  }
  function setClientId(id) {
    id = String(id || '').trim();
    if (id && !/\.apps\.googleusercontent\.com$/.test(id)) {
      toast('That is not a Google client ID');
      return false;
    }
    try { localStorage.setItem(CLIENT_KEY, id); } catch (e) {}
    return true;
  }

  function googleUser() { return meta().google; }
  function signOut() {
    const m = meta();
    m.google = null;
    writeMeta(m);
    toast('Signed out');
    return true;
  }

  /* decode (NOT verify) the ID token payload. Verification needs a server, so
     this is used for display only and must never gate anything. */
  function decodeJwt(tok) {
    try {
      const part = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (e) { return null; }
  }

  let loading = null;
  function loadGis() {
    if (window.google && window.google.accounts) return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise(res => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => res(true);
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
    return loading;
  }

  function onCredential(resp) {
    const claims = decodeJwt(resp && resp.credential);
    if (!claims) { toast('Sign-in returned nothing usable'); return; }
    const m = meta();
    m.google = { sub: claims.sub, email: claims.email || '', name: claims.name || '' };
    writeMeta(m);
    toast(`Signed in as ${m.google.name || m.google.email}`, 'gold');
    UI.renderAccount();
  }

  /* renders Google's real button into a host element, if it can */
  function mountButton(host) {
    const cid = clientId();
    if (!cid) return Promise.resolve('no-client');
    if (location.protocol === 'file:') return Promise.resolve('file');
    return loadGis().then(ok => {
      if (!ok) return 'blocked';
      try {
        google.accounts.id.initialize({
          client_id: cid,
          callback: onCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        google.accounts.id.renderButton(host, {
          theme: 'filled_black', size: 'large', shape: 'pill',
          text: 'signin_with', logo_alignment: 'left', width: 260,
        });
        return 'ok';
      } catch (e) { return 'error'; }
    });
  }

  return { profiles, activeId, active, create, rename, switchTo, remove, saveKey,
           exportCode, importCode, clientId, setClientId, googleUser, signOut,
           mountButton };
})();
