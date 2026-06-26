import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────
// Error Codes
// ─────────────────────────────────────────────

export enum ErrorCode {
  // Authentication / Authorization
  UNAUTHORIZED      = 'UNAUTHORIZED',      // 401
  FORBIDDEN         = 'FORBIDDEN',         // 403
  // Resource
  NOT_FOUND         = 'NOT_FOUND',         // 404
  CONFLICT          = 'CONFLICT',          // 409
  VERSION_CONFLICT  = 'VERSION_CONFLICT',  // 409
  // Input
  VALIDATION_ERROR  = 'VALIDATION_ERROR',  // 422
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE', // 413
  RATE_LIMITED      = 'RATE_LIMITED',      // 429
  // Sync
  SYNC_FAILED       = 'SYNC_FAILED',       // 500
  // General
  INTERNAL_ERROR    = 'INTERNAL_ERROR',    // 500
}

// ─────────────────────────────────────────────
// HTTP Status Map
// ─────────────────────────────────────────────

const STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]:      401,
  [ErrorCode.FORBIDDEN]:         403,
  [ErrorCode.NOT_FOUND]:         404,
  [ErrorCode.CONFLICT]:          409,
  [ErrorCode.VERSION_CONFLICT]:  409,
  [ErrorCode.VALIDATION_ERROR]:  422,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.RATE_LIMITED]:      429,
  [ErrorCode.SYNC_FAILED]:       500,
  [ErrorCode.INTERNAL_ERROR]:    500,
};

export function statusFor(code: ErrorCode): number {
  return STATUS_MAP[code] ?? 500;
}

// ─────────────────────────────────────────────
// AppError Class
// ─────────────────────────────────────────────

/**
 * Typed application error. Carries a machine-readable `code`, an optional
 * `details` payload (e.g. Zod field errors, conflict version info), and a
 * `retryable` flag that signals whether the caller can safely retry.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    retryable = false
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

// ─────────────────────────────────────────────
// Structured Error Response Builder
// ─────────────────────────────────────────────

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Convert any error into a structured { success: false, error: { code, message, details } }
 * NextResponse. Unknown errors become INTERNAL_ERROR / 500.
 */
export function toErrorResponse(error: unknown): NextResponse<ErrorEnvelope> {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: statusFor(error.code) }
    );
  }

  // Prisma connection errors are retryable INTERNAL_ERRORs
  if (isPrismaConnectionError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Database temporarily unavailable. Please retry.',
        },
      },
      { status: 503 }
    );
  }

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred.';

  return NextResponse.json(
    {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message,
      },
    },
    { status: 500 }
  );
}

// ─────────────────────────────────────────────
// Prisma Error Helpers
// ─────────────────────────────────────────────

/** Prisma error codes that indicate a transient connection/timeout issue */
export const PRISMA_RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

export function isPrismaConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    PRISMA_RETRYABLE_CODES.has((error as any).code)
  );
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as any).code === 'P2002'
  );
}
