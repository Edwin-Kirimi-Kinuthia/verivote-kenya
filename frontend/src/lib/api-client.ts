const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Parse body first to distinguish JWT/auth failures from business-logic failures
      // (wrong password, wrong PIN) that should NOT redirect — the caller handles those.
      let errMsg = "Unauthorized";
      let isAuthFailure = true;
      try {
        const body: { success?: boolean; error?: string } = await res.json();
        errMsg = body.error || "Unauthorized";
        const lower = errMsg.toLowerCase();
        // JWT / auth-middleware errors contain these keywords; business errors don't
        isAuthFailure =
          !body.error ||
          ["authorization", "authentication", "expired", "malformed", "signature", "token"].some(
            (kw) => lower.includes(kw)
          );
      } catch {
        /* no JSON body — treat as auth failure */
      }

      if (isAuthFailure && typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("voter");
        const isVotePath = window.location.pathname.startsWith("/vote");
        window.location.href = isVotePath ? "/vote" : "/admin/login";
      }

      throw new Error(errMsg);
    }

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || `Request failed with status ${res.status}`);
    }

    return json;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const api = new ApiClient();
