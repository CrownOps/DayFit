const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const TOKEN_KEY = "dayfit-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Pydantic v2 prefixes a validator's raised `ValueError` message with a
 * literal "Value error, " — drop that boilerplate so a Korean message reads
 * cleanly instead of "Value error, 종료 시간은 ...". */
function stripPydanticPrefix(msg: string): string {
  return msg.replace(/^value error,\s*/i, "");
}

/** FastAPI 422s send `detail` as a list of Pydantic error objects; other
 * errors send a plain string. Reduce either shape to a human-readable message
 * instead of dumping raw JSON in the UI. */
function extractErrorMessage(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item === "object" && typeof (item as { msg?: unknown }).msg === "string"
        ? stripPydanticPrefix((item as { msg: string }).msg)
        : null))
      .filter((m): m is string => !!m);
    if (messages.length) return messages.join(" ");
  } else if (typeof detail === "object" && typeof (detail as { msg?: unknown }).msg === "string") {
    return stripPydanticPrefix((detail as { msg: string }).msg);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = options;

  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = extractErrorMessage(data.detail) ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

export { API_BASE };
