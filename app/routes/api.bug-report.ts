import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const bugReportSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(120, 'Full name is too long'),
  reporterEmail: z.string().email('A valid email address is required'),
  issue: z.string().min(10, 'Issue details are required').max(4000, 'Issue details are too long'),
  summary: z.string().max(160, 'Summary is too long').optional().or(z.literal('')),
  pageUrl: z.string().max(500).optional().or(z.literal('')),
  appVersion: z.string().max(50).optional().or(z.literal('')),
  provider: z.string().max(100).optional().or(z.literal('')),
  model: z.string().max(200).optional().or(z.literal('')),
  browser: z.string().max(160).optional().or(z.literal('')),
});

function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function getClientIP(request: Request): string {
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIP = request.headers.get('x-real-ip');

  return cfConnectingIP || xForwardedFor?.split(',')[0] || xRealIP || 'unknown';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitStore.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 30 * 60 * 1000 });
    return true;
  }

  if (limit.count >= 5) {
    return false;
  }

  limit.count += 1;
  rateLimitStore.set(ip, limit);

  return true;
}

function isSpam(issue: string): boolean {
  return [
    /\b(viagra|casino|poker|loan|debt|credit)\b/i,
    /\b(click here|buy now|limited time)\b/i,
    /\b(make money|work from home|earn \$\$)\b/i,
  ].some((pattern) => pattern.test(issue));
}

function normalizeRuntimeControlBaseUrl(context?: ActionFunctionArgs['context']) {
  const rawValue =
    (context?.cloudflare?.env as Record<string, string | undefined> | undefined)?.BOLT_RUNTIME_CONTROL_PUBLIC_URL ||
    process.env.BOLT_RUNTIME_CONTROL_PUBLIC_URL ||
    process.env.BOLT_RUNTIME_CONTROL_URL ||
    'http://127.0.0.1:4321/runtime';
  const trimmed = String(rawValue || '')
    .trim()
    .replace(/\/$/, '');

  if (!trimmed) {
    return 'http://127.0.0.1:4321/runtime';
  }

  return trimmed.endsWith('/runtime') ? trimmed : `${trimmed}/runtime`;
}

async function parseRequestBody(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  const formData = await request.formData();

  return Object.fromEntries(formData.entries());
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const clientIP = getClientIP(request);

    if (!checkRateLimit(clientIP)) {
      return json({ error: 'Rate limit exceeded. Please wait before sending another bug report.' }, { status: 429 });
    }

    const rawData = await parseRequestBody(request);
    const parsed = bugReportSchema.parse(rawData);
    const sanitized = {
      fullName: sanitizeInput(parsed.fullName),
      reporterEmail: parsed.reporterEmail.trim().toLowerCase(),
      issue: sanitizeInput(parsed.issue),
      summary: parsed.summary ? sanitizeInput(parsed.summary) : '',
      pageUrl: parsed.pageUrl ? sanitizeInput(parsed.pageUrl) : '',
      appVersion: parsed.appVersion ? sanitizeInput(parsed.appVersion) : '',
      provider: parsed.provider ? sanitizeInput(parsed.provider) : '',
      model: parsed.model ? sanitizeInput(parsed.model) : '',
      browser: parsed.browser ? sanitizeInput(parsed.browser) : '',
    };

    if (isSpam(`${sanitized.summary}\n${sanitized.issue}`)) {
      return json({ error: 'Your report was flagged as potential spam.' }, { status: 400 });
    }

    const response = await fetch(`${normalizeRuntimeControlBaseUrl(context)}/bug-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIP,
        'cf-connecting-ip': clientIP,
        'user-agent': request.headers.get('user-agent') || '',
      },
      body: JSON.stringify(sanitized),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      bugReport?: { id?: string | null } | null;
      notification?: { status?: string | null } | null;
    };

    if (!response.ok) {
      return json(
        { error: payload?.error || payload?.message || 'Failed to submit the bug report.' },
        { status: response.status || 500 },
      );
    }

    return json({
      success: true,
      bugReportId: payload?.bugReport?.id || null,
      notificationStatus: payload?.notification?.status || 'draft',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: 'Invalid bug report details.', details: error.errors }, { status: 400 });
    }

    return json({ error: 'Failed to submit the bug report. Please try again later.' }, { status: 500 });
  }
}
