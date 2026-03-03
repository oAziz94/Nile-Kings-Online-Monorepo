import { NextResponse } from "next/server";

export type ApiSuccess<T = unknown> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

const ERROR_MAP: Record<string, { status: number; code: string }> = {
  BAD_REQUEST: { status: 400, code: "BAD_REQUEST" },
  UNAUTHORIZED: { status: 401, code: "UNAUTHORIZED" },
  FORBIDDEN: { status: 403, code: "FORBIDDEN" },
  NOT_FOUND: { status: 404, code: "NOT_FOUND" },
  CONFLICT: { status: 409, code: "CONFLICT" },
  UNPROCESSABLE: { status: 422, code: "UNPROCESSABLE_ENTITY" },
  TOO_MANY_REQUESTS: { status: 429, code: "TOO_MANY_REQUESTS" },
  INTERNAL: { status: 500, code: "INTERNAL_SERVER_ERROR" },
};

export function apiSuccess<T>(data: T, message?: string, status = 200) {
  return NextResponse.json(
    { success: true as const, data, ...(message && { message }) },
    { status }
  );
}

export function apiError(
  key: keyof typeof ERROR_MAP,
  message: string,
  details?: unknown
) {
  const { status, code } = ERROR_MAP[key] ?? ERROR_MAP.INTERNAL;
  return NextResponse.json(
    {
      success: false as const,
      error: { code, message, ...(details !== undefined && { details }) },
    },
    { status }
  );
}

export function apiBadRequest(message: string, details?: unknown) {
  return apiError("BAD_REQUEST", message, details);
}

export function apiUnauthorized(message = "غير مصرح") {
  return apiError("UNAUTHORIZED", message);
}

export function apiForbidden(message = "غير مصرح") {
  return apiError("FORBIDDEN", message);
}

export function apiNotFound(message = "غير موجود") {
  return apiError("NOT_FOUND", message);
}

export function apiConflict(message = "تعارض") {
  return apiError("CONFLICT", message);
}

export function apiTooManyRequests(message = "عدد الطلبات كبير، حاول لاحقاً") {
  return apiError("TOO_MANY_REQUESTS", message);
}

export function apiUnprocessable(message: string, details?: unknown) {
  return apiError("UNPROCESSABLE", message, details);
}

export function apiInternal(message = "خطأ في الخادم", details?: unknown) {
  return apiError("INTERNAL", message, details);
}
