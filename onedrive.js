// Connexion Microsoft (OAuth 2.0 + PKCE, sans dépendance externe)
// et lecture / écriture d'un fichier JSON dans le dossier d'application OneDrive.
(function () {
  const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
  const GRAPH = "https://graph.microsoft.com/v1.0";
  const SCOPES = "Files.ReadWrite.AppFolder User.Read offline_access openid profile";
  const KEY = "menu.auth";
  const cfg = window.APP_CONFIG || {};
  const redirectUri = location.origin + location.pathname;

  const b64url = (buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const randomStr = (n = 64) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
    set: (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} },
  };

  async function login() {
    if (!cfg.clientId) throw new Error("clientId manquant dans config.js");
    const verifier = randomStr(48);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = randomStr(16);
    sessionStorage.setItem("menu.pkce", JSON.stringify({ verifier, state }));
    const p = new URLSearchParams({
      client_id: cfg.clientId, response_type: "code", redirect_uri: redirectUri, scope: SCOPES,
      code_challenge: challenge, code_challenge_method: "S256", state, response_mode: "query", prompt: "select_account",
    });
    location.assign(`${AUTH}/authorize?${p}`);
  }

  async function tokenRequest(params) {
    const r = await fetch(`${AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, scope: SCOPES, ...params }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || "Erreur de connexion");
    const t = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
    store.set({ ...(store.get() || {}), ...t });
    return t;
  }

  // À appeler au démarrage : termine une connexion en cours si on revient de Microsoft.
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return;
    history.replaceState(null, "", redirectUri + location.hash);
    if (q.has("error")) throw new Error(q.get("error_description") || q.get("error"));
    const saved = JSON.parse(sessionStorage.getItem("menu.pkce") || "{}");
    sessionStorage.removeItem("menu.pkce");
    if (saved.state !== q.get("state")) throw new Error("Connexion interrompue, réessaie.");
    await tokenRequest({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: redirectUri, code_verifier: saved.verifier });
    const me = await graph("/me");
    store.set({ ...store.get(), user: me.displayName || me.userPrincipalName });
  }

  async function accessToken() {
    const s = store.get();
    if (!s) throw new Error("Non connecté");
    if (s.access && s.exp > Date.now()) return s.access;
    if (!s.refresh) throw new Error("Session expirée");
    try { return (await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh })).access; }
    catch (e) { store.set(null); throw new Error("Session expirée, reconnecte-toi."); }
  }

  async function graph(path, opts = {}) {
    const r = await fetch(GRAPH + path, { ...opts, headers: { Authorization: "Bearer " + (await accessToken()), ...(opts.headers || {}) } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`OneDrive : erreur ${r.status}`);
    const type = r.headers.get("content-type") || "";
    return type.includes("json") ? r.json() : r.text();
  }

  const filePath = () => `/me/drive/special/approot:/${encodeURIComponent(cfg.fichierOneDrive || "menu-de-la-semaine.json")}`;

  window.OneDrive = {
    configured: () => !!cfg.clientId,
    user: () => store.get()?.user || null,
    connected: () => !!store.get()?.refresh,
    login,
    logout: () => store.set(null),
    handleRedirect,
    // Renvoie { data, etag } ou null si le fichier n'existe pas encore
    async load() {
      const meta = await graph(filePath());
      if (!meta) return null;
      const txt = await graph(filePath() + ":/content");
      return { data: typeof txt === "string" ? JSON.parse(txt) : txt, etag: meta.eTag, modified: meta.lastModifiedDateTime };
    },
    async save(data) {
      const meta = await graph(filePath() + ":/content", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      return { etag: meta.eTag, modified: meta.lastModifiedDateTime };
    },
    async etag() { const m = await graph(filePath()); return m ? m.eTag : null; },
  };
})();
