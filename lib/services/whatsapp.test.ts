import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `@/lib/env` validates required env vars (DATABASE_URL, UPSTASH_REDIS_REST_URL, etc.) at
 * module-import time and throws if they're missing — which they are in the plain `npm run test`
 * environment (no dotenv loading; see docs/redesign/04-decisions.md's e2e-fixture incident for
 * the same DATABASE_URL-loading subtlety). Mocked here (via `vi.hoisted` so the mock object is
 * available when vitest hoists this `vi.mock` call above the imports below) so this file can
 * exercise `lib/services/whatsapp.ts`'s real logic without needing a real environment.
 */
const mockEnv = vi.hoisted(() => ({
  WAPILOT_INSTANCE_ID: undefined as string | undefined,
  WAPILOT_API_TOKEN: undefined as string | undefined,
  WAPILOT_API_URL: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import {
  __resetWhatsAppServiceForTests,
  getWhatsAppService,
  normalizePhoneForWhatsApp,
} from "@/lib/services/whatsapp";

describe("normalizePhoneForWhatsApp", () => {
  it.each([
    ["+201012345678", "201012345678@c.us"],
    ["+966512345678", "966512345678@c.us"],
  ])("formats %s to %s (chat_id shape WaPilot expects)", (input, expected) => {
    expect(normalizePhoneForWhatsApp(input)).toBe(expected);
  });

  it("returns an empty string for an invalid/unparseable phone", () => {
    expect(normalizePhoneForWhatsApp("notaphone")).toBe("");
  });
});

describe("getWhatsAppService", () => {
  beforeEach(() => {
    mockEnv.WAPILOT_INSTANCE_ID = undefined;
    mockEnv.WAPILOT_API_TOKEN = undefined;
    mockEnv.WAPILOT_API_URL = undefined;
    __resetWhatsAppServiceForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to a no-op service with a clear error when unconfigured, matching the old NoopWhatsAppService pattern (no hard crash)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await getWhatsAppService().sendText("+201012345678", "hello");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends via WaPilot's send-message endpoint when configured: correct URL, token header, chat_id/text body", async () => {
    mockEnv.WAPILOT_INSTANCE_ID = "inst123";
    mockEnv.WAPILOT_API_TOKEN = "tok456";
    __resetWhatsAppServiceForTests();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await getWhatsAppService().sendText("+201012345678", "رمزك 123456");

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wapilot.net/api/v2/inst123/send-message",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ token: "tok456" }),
        body: JSON.stringify({ chat_id: "201012345678@c.us", text: "رمزك 123456" }),
      })
    );
  });

  it("uses WAPILOT_API_URL when set, trimming a trailing slash", async () => {
    mockEnv.WAPILOT_INSTANCE_ID = "inst123";
    mockEnv.WAPILOT_API_TOKEN = "tok456";
    mockEnv.WAPILOT_API_URL = "https://custom.example/api/";
    __resetWhatsAppServiceForTests();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await getWhatsAppService().sendText("+201012345678", "x");

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://custom.example/api/inst123/send-message");
  });

  it("returns an error result (not a throw) on a non-OK WaPilot response", async () => {
    mockEnv.WAPILOT_INSTANCE_ID = "inst123";
    mockEnv.WAPILOT_API_TOKEN = "tok456";
    __resetWhatsAppServiceForTests();
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("invalid token", { status: 401 }));

    const result = await getWhatsAppService().sendText("+201012345678", "x");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("401");
  });

  it("returns an error result on a network exception rather than throwing", async () => {
    mockEnv.WAPILOT_INSTANCE_ID = "inst123";
    mockEnv.WAPILOT_API_TOKEN = "tok456";
    __resetWhatsAppServiceForTests();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const result = await getWhatsAppService().sendText("+201012345678", "x");

    expect(result).toEqual({ ok: false, error: "network down" });
  });

  it("rejects an invalid/unparseable phone before ever calling fetch", async () => {
    mockEnv.WAPILOT_INSTANCE_ID = "inst123";
    mockEnv.WAPILOT_API_TOKEN = "tok456";
    __resetWhatsAppServiceForTests();
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await getWhatsAppService().sendText("notaphone", "x");

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
