import { json, type ActionFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { Form, Link, useActionData, useNavigation } from '@remix-run/react';
import { z } from 'zod';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { APP_VERSION } from '~/lib/version';

type ActionData =
  | {
      success: true;
      notificationStatus: string;
    }
  | {
      success: false;
      error: string;
      details?: Array<{ path: string; message: string }>;
    };

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const applicationSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(120, 'Full name is too long.'),
  email: z.string().trim().email('A valid email address is required.').max(180, 'Email is too long.'),
  githubUsername: z
    .string()
    .trim()
    .min(2, 'GitHub username is required.')
    .max(80, 'GitHub username is too long.')
    .transform((value) =>
      value
        .replace(/^@+/, '')
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\/.*$/, ''),
    ),
  role: z.string().trim().max(160, 'Role / company is too long.').optional().or(z.literal('')),
  location: z.string().trim().max(120, 'Location / timezone is too long.').optional().or(z.literal('')),
  profileUrl: z.string().trim().max(300, 'Profile URL is too long.').optional().or(z.literal('')),
  portfolioUrl: z.string().trim().max(300, 'Portfolio URL is too long.').optional().or(z.literal('')),
  availability: z.string().trim().max(160, 'Availability is too long.').optional().or(z.literal('')),
  experience: z
    .string()
    .trim()
    .min(20, 'Tell us more about your relevant experience.')
    .max(3000, 'Experience is too long.'),
  contributionAreas: z
    .string()
    .trim()
    .min(10, 'Share at least one area where you want to help.')
    .max(2000, 'Contribution areas are too long.'),
  why: z
    .string()
    .trim()
    .min(20, 'Tell us why you want to become a bolt.gives contributor.')
    .max(3000, 'Motivation is too long.'),
});

export const meta: MetaFunction = () => [
  { title: `Contribute to bolt.gives | v${APP_VERSION}` },
  {
    name: 'description',
    content: 'Apply to become a bolt.gives open-source contributor and help build the agentic coding platform.',
  },
];

function normalizeRuntimeControlBaseUrl(context?: ActionFunctionArgs['context']) {
  const rawValue =
    (context?.cloudflare?.env as Record<string, string | undefined> | undefined)?.BOLT_RUNTIME_CONTROL_PUBLIC_URL ||
    process.env.BOLT_RUNTIME_CONTROL_PUBLIC_URL ||
    process.env.BOLT_RUNTIME_CONTROL_URL ||
    'http://127.0.0.1:4321/runtime';
  const trimmed = String(rawValue || '')
    .trim()
    .replace(/\/$/, '');

  return trimmed.endsWith('/runtime') ? trimmed : `${trimmed}/runtime`;
}

function getClientIP(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || current.resetTime <= now) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 30 * 60 * 1000 });
    return true;
  }

  if (current.count >= 4) {
    return false;
  }

  current.count += 1;
  rateLimitStore.set(ip, current);

  return true;
}

function isSpam(value: string): boolean {
  return [
    /\b(viagra|casino|poker|loan|debt|credit)\b/i,
    /\b(click here|buy now|limited time)\b/i,
    /\b(make money|work from home|earn \$\$)\b/i,
  ].some((pattern) => pattern.test(value));
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json<ActionData>({ success: false, error: 'Method not allowed.' }, { status: 405 });
  }

  const clientIP = getClientIP(request);

  if (!checkRateLimit(clientIP)) {
    return json<ActionData>(
      { success: false, error: 'Too many applications from this session. Please wait before trying again.' },
      { status: 429 },
    );
  }

  try {
    const formData = await request.formData();
    const parsed = applicationSchema.parse(Object.fromEntries(formData.entries()));

    if (isSpam(`${parsed.experience}\n${parsed.contributionAreas}\n${parsed.why}`)) {
      return json<ActionData>({ success: false, error: 'Application was flagged as potential spam.' }, { status: 400 });
    }

    const response = await fetch(`${normalizeRuntimeControlBaseUrl(context)}/contributor-applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIP,
        'cf-connecting-ip': clientIP,
        'user-agent': request.headers.get('user-agent') || '',
      },
      body: JSON.stringify({
        ...parsed,
        email: parsed.email.toLowerCase(),
        sourceUrl: request.url,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      notification?: { status?: string | null } | null;
    };

    if (!response.ok) {
      return json<ActionData>(
        { success: false, error: payload.error || payload.message || 'Unable to submit the application right now.' },
        { status: response.status || 500 },
      );
    }

    return json<ActionData>({
      success: true,
      notificationStatus: payload.notification?.status || 'sent',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json<ActionData>(
        {
          success: false,
          error: 'Please fix the highlighted contribution application details.',
          details: error.errors.map((entry) => ({
            path: entry.path.join('.'),
            message: entry.message,
          })),
        },
        { status: 400 },
      );
    }

    return json<ActionData>(
      { success: false, error: 'Unable to submit the application right now. Please try again later.' },
      { status: 500 },
    );
  }
}

function fieldError(actionData: ActionData | undefined, name: string) {
  if (!actionData || actionData.success) {
    return null;
  }

  return actionData.details?.find((detail) => detail.path === name)?.message || null;
}

function InputField({
  label,
  name,
  type = 'text',
  placeholder,
  required = false,
  actionData,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  actionData?: ActionData;
}) {
  const error = fieldError(actionData, name);

  return (
    <label className="block">
      <span className="text-sm font-semibold text-bolt-elements-textPrimary">{label}</span>
      <input
        className="mt-2 w-full rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3 text-sm text-bolt-elements-textPrimary outline-none transition focus:border-bolt-elements-borderColorActive focus:ring-2 focus:ring-bolt-elements-borderColorActive/25"
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
      />
      {error ? <span className="mt-1 block text-xs text-bolt-elements-icon-error">{error}</span> : null}
    </label>
  );
}

function TextareaField({
  label,
  name,
  placeholder,
  required = false,
  actionData,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  actionData?: ActionData;
}) {
  const error = fieldError(actionData, name);

  return (
    <label className="block">
      <span className="text-sm font-semibold text-bolt-elements-textPrimary">{label}</span>
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3 text-sm leading-6 text-bolt-elements-textPrimary outline-none transition focus:border-bolt-elements-borderColorActive focus:ring-2 focus:ring-bolt-elements-borderColorActive/25"
        name={name}
        placeholder={placeholder}
        required={required}
      />
      {error ? <span className="mt-1 block text-xs text-bolt-elements-icon-error">{error}</span> : null}
    </label>
  );
}

export default function ContributePage() {
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <BackgroundRays />
      <Header />
      <main className="relative z-1 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 rounded-[2rem] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-xl backdrop-blur md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <div className="flex flex-col justify-between gap-8 rounded-[1.5rem] bg-gradient-to-br from-teal-950 via-slate-900 to-amber-700 p-7 text-white">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">Open source pathway</div>
              <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight sm:text-5xl">
                Become a bolt.gives contributor.
              </h1>
              <p className="mt-5 text-base leading-7 text-white/82">
                Help build the transparent agentic coding platform: preview reliability, runtime tooling, provider
                safety, managed deployments, documentation, templates, and contributor-ready issues.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-white/85">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                Submit the form, include your GitHub username, and tell us where you can make a real contribution.
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                Accepted contributors can open PRs, pick roadmap tasks, and help improve the live platform.
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5 sm:p-6">
            {actionData?.success ? (
              <div className="rounded-3xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-bolt-elements-textTertiary">
                  Application received
                </div>
                <h2 className="mt-3 text-2xl font-bold text-bolt-elements-textPrimary">
                  Thanks for applying to contribute.
                </h2>
                <p className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">
                  We sent your application to the operator inbox and sent you a confirmation email when SMTP was
                  available. The team will review your GitHub profile and reply if there is a fit for the current
                  roadmap.
                </p>
                <Link
                  className="mt-5 inline-flex rounded-full border border-bolt-elements-borderColor px-4 py-2 text-sm font-semibold text-bolt-elements-textPrimary transition hover:bg-bolt-elements-background-depth-3"
                  to="/"
                >
                  Back to bolt.gives
                </Link>
              </div>
            ) : (
              <Form method="post" className="space-y-5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-bolt-elements-textTertiary">
                    Contributor application
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-bolt-elements-textPrimary">Tell us how you can help.</h2>
                  <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">
                    We review applications manually. Be specific about shipped work, open-source history, and the
                    bolt.gives areas you want to improve.
                  </p>
                </div>

                {actionData && !actionData.success ? (
                  <div className="rounded-2xl border border-bolt-elements-icon-error/30 bg-bolt-elements-icon-error/10 px-4 py-3 text-sm text-bolt-elements-icon-error">
                    {actionData.error}
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField actionData={actionData} label="Full name" name="fullName" required />
                  <InputField actionData={actionData} label="Email address" name="email" type="email" required />
                  <InputField
                    actionData={actionData}
                    label="GitHub username"
                    name="githubUsername"
                    placeholder="@username"
                    required
                  />
                  <InputField
                    actionData={actionData}
                    label="Role / company"
                    name="role"
                    placeholder="Frontend engineer, maintainer, founder..."
                  />
                  <InputField
                    actionData={actionData}
                    label="Location / timezone"
                    name="location"
                    placeholder="Cape Town, UTC+2"
                  />
                  <InputField
                    actionData={actionData}
                    label="Profile URL"
                    name="profileUrl"
                    placeholder="LinkedIn, website, or public profile"
                  />
                  <InputField
                    actionData={actionData}
                    label="Portfolio / shipped work"
                    name="portfolioUrl"
                    placeholder="Project, repo, or case study URL"
                  />
                  <InputField
                    actionData={actionData}
                    label="Availability"
                    name="availability"
                    placeholder="3 hours/week, weekends, etc."
                  />
                </div>

                <TextareaField
                  actionData={actionData}
                  label="Relevant experience"
                  name="experience"
                  placeholder="Describe your experience with React, Remix, Cloudflare, runtimes, AI tooling, open-source maintenance, docs, design, testing, or related areas."
                  required
                />
                <TextareaField
                  actionData={actionData}
                  label="Where do you want to contribute?"
                  name="contributionAreas"
                  placeholder="Examples: prompt-to-preview reliability, E2E tests, Cloudflare deployments, templates, UI, docs, self-host installer, provider safety."
                  required
                />
                <TextareaField
                  actionData={actionData}
                  label="Why do you want to become a bolt.gives contributor?"
                  name="why"
                  placeholder="Tell us what motivates you and what impact you want to have on the project."
                  required
                />

                <button
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-bolt-elements-button-primary-background px-5 py-3 text-sm font-bold text-bolt-elements-button-primary-text transition hover:bg-bolt-elements-button-primary-backgroundHover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? 'Submitting application...' : 'Apply to contribute'}
                </button>
              </Form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
