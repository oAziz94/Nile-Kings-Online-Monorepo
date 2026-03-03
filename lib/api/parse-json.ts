/**
 * Safely parse JSON from a fetch Response.
 * Avoids "Unexpected end of JSON input" when the response body is empty or invalid.
 */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
