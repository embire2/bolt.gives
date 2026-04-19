#!/usr/bin/env node

import nodemailer from 'nodemailer';
import { recordAdminEmailMessage } from './admin-db.mjs';
import { readMergedRuntimeEnv } from './runtime-env-file.mjs';

let transporterPromise = null;
let transporterCacheKey = null;

function envValue(env, key) {
  return String(env?.[key] || '').trim();
}

/**
 * @param {Record<string, string | undefined> | null} [env]
 */
function readAdminMailConfig(env = null) {
  const effectiveEnv = env ? { ...env } : readMergedRuntimeEnv();
  const host = envValue(effectiveEnv, 'BOLT_ADMIN_SMTP_HOST');
  const port = Number(envValue(effectiveEnv, 'BOLT_ADMIN_SMTP_PORT') || '587');
  const user = envValue(effectiveEnv, 'BOLT_ADMIN_SMTP_USER');
  const pass = envValue(effectiveEnv, 'BOLT_ADMIN_SMTP_PASSWORD');
  const fromAddress = envValue(effectiveEnv, 'BOLT_ADMIN_SMTP_FROM');
  const secure = envValue(effectiveEnv, 'BOLT_ADMIN_SMTP_SECURE') === 'true' || port === 465;
  const configured = Boolean(host && fromAddress && ((user && pass) || (!user && !pass)));

  return {
    configured,
    host: host || null,
    port,
    secure,
    user: user || null,
    pass: pass || null,
    hasPassword: Boolean(pass),
    fromAddress: fromAddress || null,
    transportLabel: configured ? `SMTP ${host}:${port}` : null,
    reason: configured ? null : 'SMTP is not configured on the runtime service yet.',
  };
}

/**
 * @param {Record<string, string | undefined> | null} [env]
 */
export function buildAdminMailSupport(env = null) {
  const config = readAdminMailConfig(env);

  return {
    configured: config.configured,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    hasPassword: config.hasPassword,
    fromAddress: config.fromAddress,
    transportLabel: config.transportLabel,
    reason: config.reason,
  };
}

export function resetAdminMailTransporter() {
  transporterPromise = null;
  transporterCacheKey = null;
}

async function getTransporter() {
  const config = readAdminMailConfig();

  if (!config.configured) {
    return null;
  }

  const cacheKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    pass: config.pass,
    fromAddress: config.fromAddress,
  });

  if (!transporterPromise || transporterCacheKey !== cacheKey) {
    transporterCacheKey = cacheKey;
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      }),
    );
  }

  return transporterPromise;
}

function normalizeMessageBody(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export async function sendAdminEmail({ profileEmail, subject, body, actor = 'admin' } = {}) {
  const support = buildAdminMailSupport();
  const normalizedEmail = String(profileEmail || '')
    .trim()
    .toLowerCase();
  const normalizedSubject = String(subject || '').trim();
  const normalizedBody = normalizeMessageBody(body);

  if (!normalizedEmail || !normalizedSubject || !normalizedBody) {
    throw new Error('Email, subject, and message body are required.');
  }

  if (!support.configured) {
    return await recordAdminEmailMessage({
      profileEmail: normalizedEmail,
      subject: normalizedSubject,
      body: normalizedBody,
      actor,
      status: 'draft',
      transport: null,
      error: support.reason,
    });
  }

  try {
    const transporter = await getTransporter();

    await transporter.sendMail({
      from: support.fromAddress,
      to: normalizedEmail,
      subject: normalizedSubject,
      text: normalizedBody,
      html: normalizedBody
        .split('\n')
        .map((line) =>
          line.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]),
        )
        .join('<br />'),
    });

    return await recordAdminEmailMessage({
      profileEmail: normalizedEmail,
      subject: normalizedSubject,
      body: normalizedBody,
      actor,
      status: 'sent',
      transport: support.transportLabel,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    return await recordAdminEmailMessage({
      profileEmail: normalizedEmail,
      subject: normalizedSubject,
      body: normalizedBody,
      actor,
      status: 'failed',
      transport: support.transportLabel,
      error: error instanceof Error ? error.message : 'SMTP send failed.',
    });
  }
}

export async function sendAdminEmailBatch({ recipients = [], subject, body, actor = 'admin' } = {}) {
  const normalizedRecipients = [
    ...new Set(
      recipients.map((recipient) =>
        String(recipient || '')
          .trim()
          .toLowerCase(),
      ),
    ),
  ].filter(Boolean);

  if (normalizedRecipients.length === 0) {
    throw new Error('At least one recipient is required.');
  }

  const results = [];

  for (const recipient of normalizedRecipients) {
    results.push(await sendAdminEmail({ profileEmail: recipient, subject, body, actor }));
  }

  return {
    total: normalizedRecipients.length,
    sent: results.filter((result) => result?.status === 'sent').length,
    drafted: results.filter((result) => result?.status === 'draft').length,
    failed: results.filter((result) => result?.status === 'failed').length,
    messages: results,
  };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function buildBugReportNotification({ fullName, reporterEmail, summary, issue, pageUrl, appVersion, provider, model, browser }) {
  const normalizedSummary = String(summary || '').trim() || 'User bug report';
  const normalizedIssue = normalizeMessageBody(issue);
  const lines = [
    `Reporter: ${fullName}`,
    `Reply-to: ${reporterEmail}`,
    pageUrl ? `Page: ${pageUrl}` : '',
    appVersion ? `Version: ${appVersion}` : '',
    provider ? `Provider: ${provider}` : '',
    model ? `Model: ${model}` : '',
    browser ? `Browser: ${browser}` : '',
  ].filter(Boolean);

  const text = `${normalizedSummary}\n\n${lines.join('\n')}\n\nIssue details:\n${normalizedIssue}`;
  const html = `
    <div style="font-family:Inter,Segoe UI,system-ui,sans-serif;background:#f7f7fb;padding:24px;color:#141420;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 16px 50px rgba(15,23,42,0.08);">
        <div style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#4f46e5);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.8;">bolt.gives bug report</div>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;">${escapeHtml(normalizedSummary)}</h1>
        </div>
        <div style="padding:24px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px;">
            ${[
              ['Reporter', fullName],
              ['Reply-to', reporterEmail],
              ['Page', pageUrl],
              ['Version', appVersion],
              ['Provider', provider],
              ['Model', model],
              ['Browser', browser],
            ]
              .filter(([, value]) => value)
              .map(
                ([label, value]) => `
                  <div style="border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px;background:#fafafa;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;">${escapeHtml(label)}</div>
                    <div style="margin-top:6px;font-size:14px;font-weight:600;color:#111827;word-break:break-word;">${escapeHtml(value)}</div>
                  </div>
                `,
              )
              .join('')}
          </div>
          <div style="border:1px solid #e5e7eb;border-radius:16px;padding:18px 20px;background:#ffffff;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.16em;color:#6b7280;">Issue details</div>
            <div style="margin-top:12px;font-size:14px;line-height:1.65;color:#111827;white-space:pre-wrap;">${escapeHtml(normalizedIssue)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  return { text, html };
}

export async function sendBugReportNotification({
  fullName,
  reporterEmail,
  summary,
  issue,
  pageUrl = null,
  appVersion = null,
  provider = null,
  model = null,
  browser = null,
} = {}) {
  const support = buildAdminMailSupport();
  const recipient = envValue(readMergedRuntimeEnv(), 'BOLT_BUG_REPORT_RECIPIENT') || 'wow@openweb.email';
  const normalizedReporterEmail = String(reporterEmail || '')
    .trim()
    .toLowerCase();
  const normalizedFullName = String(fullName || '').trim();

  if (!normalizedFullName || !normalizedReporterEmail || !String(issue || '').trim()) {
    throw new Error('Bug report notification requires full name, reporter email, and issue details.');
  }

  const normalizedSummary =
    String(summary || '').trim() ||
    String(issue || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 120) ||
    'User bug report';

  if (!support.configured) {
    return {
      status: 'draft',
      recipient,
      transport: null,
      error: support.reason,
      sentAt: null,
    };
  }

  try {
    const transporter = await getTransporter();
    const formatted = buildBugReportNotification({
      fullName: normalizedFullName,
      reporterEmail: normalizedReporterEmail,
      summary: normalizedSummary,
      issue,
      pageUrl,
      appVersion,
      provider,
      model,
      browser,
    });

    await transporter.sendMail({
      from: support.fromAddress,
      to: recipient,
      replyTo: normalizedReporterEmail,
      subject: `[Bug Report] ${normalizedSummary}`,
      text: formatted.text,
      html: formatted.html,
    });

    return {
      status: 'sent',
      recipient,
      transport: support.transportLabel,
      error: null,
      sentAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'failed',
      recipient,
      transport: support.transportLabel,
      error: error instanceof Error ? error.message : 'SMTP send failed.',
      sentAt: null,
    };
  }
}
