(function () {
  const tokenKey = "kvartal-jwt";
  const baseUrl = window.KVARTA_API_BASE
    || (location.protocol === "file:" ? "http://localhost:3000/api" : "/api");

  class ApiError extends Error {
    constructor(message, status, details) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  }

  function token() {
    return localStorage.getItem(tokenKey);
  }

  function setToken(value) {
    if (value) localStorage.setItem(tokenKey, value);
    else localStorage.removeItem(tokenKey);
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token()) headers.Authorization = `Bearer ${token()}`;

    const send = () => fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    let response;
    try {
      response = await send();
    } catch (error) {
      if (path !== "/auth/login") throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await send();
    }

    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) setToken("");
      throw new ApiError(payload.error || "Ошибка запроса", response.status, payload.details);
    }
    return payload.data;
  }

  function queryString(params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) query.set(key, String(value));
    });
    const value = query.toString();
    return value ? `?${value}` : "";
  }

  window.kvartalApi = {
    token,
    setToken,
    register: async (body) => {
      const data = await request("/auth/register", { method: "POST", body });
      setToken(data.token);
      return data.user;
    },
    login: async (body) => {
      const data = await request("/auth/login", { method: "POST", body });
      setToken(data.token);
      return data.user;
    },
    logout: async () => {
      try {
        await request("/auth/logout", { method: "POST" });
      } finally {
        setToken("");
      }
    },
    me: () => request("/auth/me"),
    updateMe: (body) => request("/users/me", { method: "PATCH", body }),
    preferences: () => request("/users/me/preferences"),
    savePreferences: (body) => request("/users/me/preferences", { method: "PUT", body }),
    listings: (params) => request(`/listings${queryString(params)}`),
    myListings: () => request("/listings/mine"),
    listing: (id) => request(`/listings/${id}`),
    createListing: (body) => request("/listings", { method: "POST", body }),
    updateListing: (id, body) => request(`/listings/${id}`, { method: "PATCH", body }),
    closeListing: (id) => request(`/listings/${id}/close`, { method: "PATCH" }),
    deleteListing: (id) => request(`/listings/${id}`, { method: "DELETE" }),
    addView: (id) => request(`/listings/${id}/view`, { method: "POST" }),
    favorites: () => request("/favorites"),
    addFavorite: (id) => request(`/favorites/${id}`, { method: "POST" }),
    removeFavorite: (id) => request(`/favorites/${id}`, { method: "DELETE" }),
    chats: () => request("/chats"),
    createChat: (listingId) => request("/chats", { method: "POST", body: { listingId } }),
    messages: (chatId) => request(`/chats/${chatId}/messages`),
    sendMessage: (chatId, body) => request(`/chats/${chatId}/messages`, { method: "POST", body: { body } }),
    rateSeller: (chatId, body) => request(`/chats/${chatId}/rating`, { method: "POST", body }),
    moderationListings: (status) => request(`/moderation/listings${queryString({ status })}`),
    moderationListing: (id) => request(`/moderation/listings/${id}`),
    decide: (id, body) => request(`/moderation/listings/${id}/decision`, { method: "POST", body })
  };
})();
