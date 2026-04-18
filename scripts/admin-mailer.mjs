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
