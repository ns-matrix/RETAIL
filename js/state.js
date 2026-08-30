// state.js — Minimal app state + pub-sub reactivity

const app = {
  state: {
    user: null,          // { id, user_code, full_name, mobile, ... }
    session: null,       // supabase auth session
    adminUser: null,     // admin_users row (admin app only)
    currentPage: '',     // current hash route
    loading: false,
  },
  _listeners: [],

  set(key, value) {
    this.state[key] = value;
    this._notify(key);
  },

  get(key) {
    return this.state[key];
  },

  subscribe(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  },

  _notify(changedKey) {
    this._listeners.forEach((fn) => fn(changedKey, this.state));
  },
};
