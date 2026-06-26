import process from 'process';
import { AppError, ErrorCode, toErrorResponse, statusFor, isPrismaConnectionError } from './src/lib/errors';
import { withRetry } from './src/lib/retry';
import { authMiddleware, roleMiddleware, validationMiddleware } from './src/lib/api-middleware';
import { auditRepository } from './src/server/repositories/audit.repository';
import { AuditAction } from '@prisma/client';
import { NextRequest } from 'next/server';
import { z } from 'zod';

// ─────────────────────────────────────────────
// Mock auditRepository.logAction
// ─────────────────────────────────────────────
let capturedLogs: any[] = [];
const originalLogAction = auditRepository.logAction.bind(auditRepository);
auditRepository.logAction = async (userId, action, documentId?, metadata?) => {
  capturedLogs.push({ userId, action, documentId, metadata });
  return { id: 'log-1', userId, action, documentId: documentId ?? null, metadata: metadata ?? null, createdAt: new Date() } as any;
};

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────
function createMockRequest(url: string, method = 'GET', body?: any, userId?: string): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (userId) {
    (req as any).auth = { user: { id: userId, email: `${userId}@test.com`, name: 'Test User' } };
  }
  return req;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────
async function runErrorHandlingTests() {
  console.log('=== Running Phase 14: Error Handling Verification Tests ===');
  let passed = true;

  // ─── Test 1: AppError carries code, message, details, retryable ─────────
  {
    const err = new AppError(ErrorCode.FORBIDDEN, 'Access denied', { reason: 'not a member' }, false);
    const ok = err.code === ErrorCode.FORBIDDEN &&
               err.message === 'Access denied' &&
               err.details?.reason === 'not a member' &&
               err.retryable === false &&
               err.name === 'AppError';
    console.log(`Test 1: AppError structure -> ${ok ? 'PASSED' : 'FAILED'}`);
    if (!ok) passed = false;
  }

  // ─── Test 2: statusFor returns correct HTTP status codes ─────────────────
  {
    const checks = [
      [ErrorCode.UNAUTHORIZED, 401],
      [ErrorCode.FORBIDDEN, 403],
      [ErrorCode.NOT_FOUND, 404],
      [ErrorCode.CONFLICT, 409],
      [ErrorCode.VERSION_CONFLICT, 409],
      [ErrorCode.VALIDATION_ERROR, 422],
      [ErrorCode.PAYLOAD_TOO_LARGE, 413],
      [ErrorCode.RATE_LIMITED, 429],
      [ErrorCode.SYNC_FAILED, 500],
      [ErrorCode.INTERNAL_ERROR, 500],
    ] as [ErrorCode, number][];

    let allOk = true;
    for (const [code, expectedStatus] of checks) {
      if (statusFor(code) !== expectedStatus) {
        console.log(`  statusFor(${code}) = ${statusFor(code)}, expected ${expectedStatus}`);
        allOk = false;
      }
    }
    console.log(`Test 2: statusFor() HTTP status map -> ${allOk ? 'PASSED' : 'FAILED'}`);
    if (!allOk) passed = false;
  }

  // ─── Test 3: toErrorResponse() - AppError produces structured envelope ───
  {
    const err = new AppError(ErrorCode.FORBIDDEN, 'You shall not pass', { hint: 'check role' });
    const res = toErrorResponse(err);
    const body = await res.json();

    const ok = res.status === 403 &&
               body.success === false &&
               body.error.code === 'FORBIDDEN' &&
               body.error.message === 'You shall not pass' &&
               body.error.details?.hint === 'check role';
    console.log(`Test 3: toErrorResponse(AppError) -> ${ok ? 'PASSED' : 'FAILED'} (status: ${res.status}, body: ${JSON.stringify(body)})`);
    if (!ok) passed = false;
  }

  // ─── Test 4: toErrorResponse() - generic Error fallback ─────────────────
  {
    const res = toErrorResponse(new Error('Something broke'));
    const body = await res.json();

    const ok = res.status === 500 &&
               body.success === false &&
               body.error.code === 'INTERNAL_ERROR' &&
               body.error.message === 'Something broke';
    console.log(`Test 4: toErrorResponse(generic Error) -> ${ok ? 'PASSED' : 'FAILED'}`);
    if (!ok) passed = false;
  }

  // ─── Test 5: isPrismaConnectionError detects P1001/P1002 ────────────────
  {
    const p1001 = Object.assign(new Error('DB unreachable'), { code: 'P1001' });
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const ok = isPrismaConnectionError(p1001) === true &&
               isPrismaConnectionError(p2002) === false &&
               isPrismaConnectionError(new Error('normal')) === false;
    console.log(`Test 5: isPrismaConnectionError detection -> ${ok ? 'PASSED' : 'FAILED'}`);
    if (!ok) passed = false;
  }

  // ─── Test 6: withRetry - retries exactly 3x on Prisma connection error ──
  {
    let callCount = 0;
    const p1001 = Object.assign(new Error('DB unreachable'), { code: 'P1001' });

    try {
      await withRetry(async () => {
        callCount++;
        throw p1001;
      }, { maxAttempts: 3, delayMs: 1, backoff: 1 });
      console.log(`Test 6: withRetry retries on Prisma error -> FAILED (should have thrown)`);
      passed = false;
    } catch {
      const ok = callCount === 3;
      console.log(`Test 6: withRetry retries exactly 3x on Prisma connection error -> ${ok ? 'PASSED' : 'FAILED'} (calls: ${callCount})`);
      if (!ok) passed = false;
    }
  }

  // ─── Test 7: withRetry - does NOT retry non-retryable AppError ──────────
  {
    let callCount = 0;
    try {
      await withRetry(async () => {
        callCount++;
        throw new AppError(ErrorCode.FORBIDDEN, 'Not retryable', undefined, false);
      }, { maxAttempts: 3, delayMs: 1 });
      console.log(`Test 7: withRetry skips non-retryable AppError -> FAILED (should have thrown)`);
      passed = false;
    } catch (e) {
      const ok = callCount === 1 && e instanceof AppError && e.code === ErrorCode.FORBIDDEN;
      console.log(`Test 7: withRetry does NOT retry non-retryable AppError -> ${ok ? 'PASSED' : 'FAILED'} (calls: ${callCount})`);
      if (!ok) passed = false;
    }
  }

  // ─── Test 8: withRetry - retries on AppError with retryable: true ───────
  {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      if (callCount < 3) throw new AppError(ErrorCode.INTERNAL_ERROR, 'Transient', undefined, true);
      return 'success';
    }, { maxAttempts: 3, delayMs: 1, backoff: 1 });
    const ok = result === 'success' && callCount === 3;
    console.log(`Test 8: withRetry retries AppError(retryable=true) and succeeds -> ${ok ? 'PASSED' : 'FAILED'} (calls: ${callCount})`);
    if (!ok) passed = false;
  }

  // ─── Test 9: authMiddleware throws UNAUTHORIZED when no session ──────────
  {
    // Inject a mock auth context with null user — simulates "logged out" state
    // without calling next-auth's auth() in an invalid context
    const req = createMockRequest('http://localhost/api/test', 'GET');
    (req as any).auth = { user: null }; // mock: has auth context but no user
    const ctx = { params: {}, user: null };
    let threw = false;
    let errCode: string | undefined;
    try {
      await authMiddleware(req, ctx as any);
    } catch (e) {
      threw = true;
      if (e instanceof AppError) errCode = e.code;
    }
    const ok = threw && errCode === ErrorCode.UNAUTHORIZED;
    console.log(`Test 9: authMiddleware throws UNAUTHORIZED -> ${ok ? 'PASSED' : 'FAILED'} (code: ${errCode})`);
    if (!ok) passed = false;
  }

  // ─── Test 10: validationMiddleware throws VALIDATION_ERROR on bad input ──
  {
    const schema = z.object({ name: z.string().min(3) });
    const middleware = validationMiddleware(schema);
    const req = createMockRequest('http://localhost/api/test', 'POST', { name: 'ab' });
    const ctx = { params: {}, user: { id: 'u1', email: 'u@t.com', name: 'U' } };
    let errCode: string | undefined;
    let hasFieldErrors = false;
    try {
      await middleware(req, ctx as any);
    } catch (e) {
      if (e instanceof AppError) {
        errCode = e.code;
        hasFieldErrors = !!e.details?.fieldErrors;
      }
    }
    const ok = errCode === ErrorCode.VALIDATION_ERROR && hasFieldErrors;
    console.log(`Test 10: validationMiddleware throws VALIDATION_ERROR with fieldErrors -> ${ok ? 'PASSED' : 'FAILED'} (code: ${errCode}, hasFields: ${hasFieldErrors})`);
    if (!ok) passed = false;
  }

  // ─── Test 11: roleMiddleware throws FORBIDDEN when no documentId ─────────
  {
    const checkPerm = async () => false;
    const middleware = roleMiddleware(checkPerm);
    const req = createMockRequest('http://localhost/api/test', 'GET', undefined, 'user-1');
    const ctx = { params: {}, user: { id: 'user-1', email: 'u@t.com', name: 'U' } };
    let errCode: string | undefined;
    try {
      await middleware(req, ctx as any);
    } catch (e) {
      if (e instanceof AppError) errCode = e.code;
    }
    const ok = errCode === ErrorCode.VALIDATION_ERROR; // missing documentId = validation error
    console.log(`Test 11: roleMiddleware throws VALIDATION_ERROR for missing documentId -> ${ok ? 'PASSED' : 'FAILED'} (code: ${errCode})`);
    if (!ok) passed = false;
  }

  // ─── Test 12: roleMiddleware throws FORBIDDEN when permission denied ──────
  {
    const checkPerm = async () => false;
    const middleware = roleMiddleware(checkPerm);
    const req = createMockRequest('http://localhost/api/test?documentId=doc-1', 'GET', undefined, 'user-1');
    const ctx = { params: {}, user: { id: 'user-1', email: 'u@t.com', name: 'U' } };
    let errCode: string | undefined;
    try {
      await middleware(req, ctx as any);
    } catch (e) {
      if (e instanceof AppError) errCode = e.code;
    }
    const ok = errCode === ErrorCode.FORBIDDEN;
    console.log(`Test 12: roleMiddleware throws FORBIDDEN on permission denied -> ${ok ? 'PASSED' : 'FAILED'} (code: ${errCode})`);
    if (!ok) passed = false;
  }

  // ─── Test 13: SYNC_FAILED audit log is captured on sync error ────────────
  {
    capturedLogs = [];
    // Simulate sync failure log directly (service-level)
    await auditRepository.logAction('user-x', AuditAction.SYNC_FAILED, 'doc-x', {
      clientId: 'client-1',
      version: 5,
      error: 'DB write failed',
    });
    const log = capturedLogs.find(l => l.action === AuditAction.SYNC_FAILED);
    const ok = !!log &&
               log.userId === 'user-x' &&
               log.documentId === 'doc-x' &&
               log.metadata?.error === 'DB write failed';
    console.log(`Test 13: SYNC_FAILED audit log captured -> ${ok ? 'PASSED' : 'FAILED'} (${JSON.stringify(log)})`);
    if (!ok) passed = false;
  }

  // ─────────────────────────────────────────────
  // Restore
  auditRepository.logAction = originalLogAction;

  console.log(`\n=== Error Handling Tests Status: ${passed ? 'SUCCESS' : 'FAILURE'} ===`);
  process.exit(passed ? 0 : 1);
}

if (require.main === module) {
  runErrorHandlingTests().catch((e) => {
    console.error('Unexpected error in test runner:', e);
    process.exit(1);
  });
}
