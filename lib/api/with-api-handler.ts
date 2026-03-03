/**
 * Centralized API error handling: wrap route handlers to catch uncaught errors,
 * log them, and return a consistent JSON error response.
 */

import { NextResponse } from "next/server";
import { apiInternal } from "./response";

export type ApiHandler<T = unknown> = (req: Request, context?: T) => Promise<NextResponse>;

export function withApiHandler<T = unknown>(handler: ApiHandler<T>, context?: T): ApiHandler<T> {
  return async (req: Request, ctx?: T) => {
    try {
      return await handler(req, context ?? ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      const stack = e instanceof Error ? e.stack : undefined;
      console.error("[API Error]", message, stack);
      return apiInternal("خطأ في الخادم", { message });
    }
  };
}
