async function request(path, options = {}) {
  const config = {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  };

  const response = await fetch(path, config);
  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    const message = payload?.detail || `Request failed (${response.status})`;
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.status = response.status;
    throw error;
  }

  return payload;
}

export const api = {
  getRegistrationConfig: () => request("/api/auth/registration-config"),
  me: () => request("/api/auth/me"),
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  getOverview: (page = 1, pageSize = 5) =>
    request(`/api/balances/overview?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`),
  createHistory: (body) => request("/api/balances/history", { method: "POST", body: JSON.stringify(body) }),
  addBalances: (body) => request("/api/balances/add-balance", { method: "POST", body: JSON.stringify(body) }),
  getHistoryEntry: (id) => request(`/api/balances/history/${id}`),
  updateHistory: (id, body) => request(`/api/balances/history/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteHistory: (id) => request(`/api/balances/history/${id}`, { method: "DELETE" }),

  getUsageSummary: ({ period = "all", startDate = "", endDate = "" } = {}) => {
    const params = new URLSearchParams({ period });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return request(`/api/usage/summary?${params.toString()}`);
  },
};
