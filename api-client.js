(function () {
  const config = window.UNITED_AZEROTH_SUPABASE || window.UNITED_AZEROTH_API || {};
  const baseUrl = String(config.url || "").replace(/\/$/, "");
  const storageKey = "ua-guild-api-session";
  const listeners = new Set();

  function readSession() {
    try {
      const session = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!session?.access_token || (session.expires_at && session.expires_at * 1000 <= Date.now())) return null;
      return session;
    } catch { return null; }
  }

  function writeSession(session) {
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
  }

  function notify(event, session) {
    listeners.forEach((listener) => { try { listener(event, session); } catch {} });
  }

  async function request(path, options = {}) {
    const session = readSession();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    try {
      const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return { data: null, error: { message: payload.error || `Request failed (${response.status}).` }, count: null };
      return { data: payload.data ?? payload, error: null, count: payload.count ?? null };
    } catch {
      return { data: null, error: { message: "The guild service is temporarily unavailable." }, count: null };
    }
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table; this.action = "select"; this.data = null; this.filters = []; this.orders = [];
      this.maxRows = null; this.wantSingle = false; this.wantMaybeSingle = false; this.returning = false; this.countMode = null; this.head = false;
    }
    select(_columns = "*", options = {}) {
      if (this.action !== "select") this.returning = true;
      this.countMode = options.count || this.countMode; this.head = Boolean(options.head); return this;
    }
    insert(data) { this.action = "insert"; this.data = data; return this; }
    update(data) { this.action = "update"; this.data = data; return this; }
    upsert(data) { this.action = "upsert"; this.data = data; return this; }
    delete() { this.action = "delete"; return this; }
    eq(column, value) { this.filters.push({ column, operator: "eq", value }); return this; }
    in(column, value) { this.filters.push({ column, operator: "in", value }); return this; }
    order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
    limit(value) { this.maxRows = value; return this; }
    single() { this.wantSingle = true; return this; }
    maybeSingle() { this.wantMaybeSingle = true; return this; }
    async execute() {
      return request("/api/query", { method: "POST", body: JSON.stringify({
        table: this.table, action: this.action, data: this.data, filters: this.filters, orders: this.orders,
        limit: this.maxRows, single: this.wantSingle, maybeSingle: this.wantMaybeSingle,
        returning: this.returning, count: this.countMode, head: this.head
      }) });
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }

  const auth = {
    async getSession() { return { data: { session: readSession() }, error: null }; },
    async getUser() {
      const session = readSession();
      if (!session) return { data: { user: null }, error: null };
      const result = await request("/api/auth/me", { method: "GET" });
      if (result.error) return { data: { user: null }, error: result.error };
      const user = result.data.user || null;
      if (user) { const updated = { ...session, user }; writeSession(updated); }
      return { data: { user }, error: null };
    },
    async signInWithPassword(credentials) {
      const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) });
      if (!result.error && result.data.session) { writeSession(result.data.session); notify("SIGNED_IN", result.data.session); }
      return result;
    },
    async signUp(input) {
      const result = await request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: input.email, password: input.password, metadata: input.options?.data || {} }) });
      if (!result.error && result.data.session) { writeSession(result.data.session); notify("SIGNED_IN", result.data.session); }
      return result;
    },
    async signOut() {
      const result = await request("/api/auth/logout", { method: "POST", body: "{}" });
      writeSession(null); notify("SIGNED_OUT", null); return result;
    },
    async resetPasswordForEmail() { return { data: null, error: { message: "Password resets are not enabled yet. Ask a Guild Master for help." } }; },
    onAuthStateChange(callback) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    }
  };

  function createClient() {
    return {
      auth,
      from(table) { return new QueryBuilder(table); },
      async rpc(name, parameters) {
        const result = await request(`/api/rpc/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(parameters || {}) });
        if (result.error) return result;
        return { data: result.data?.data ?? result.data, error: null };
      }
    };
  }

  window.supabase = { createClient };
  window.uaGuildApi = { request, readSession, writeSession, baseUrl };
})();
