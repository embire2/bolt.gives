#!/usr/bin/env node

import nodemailer from 'nodemailer';
import { recordAdminEmailMessage } from './admin-db.mjs';

let transporterPromise = null;

function envValue(env, key) {
  return String(env?.[key] || '').trim();
}

export function buildAdminMailSupport(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  const host = envValue(env, 'BOLT_ADMIN_SMTP_HOST');
  const port = Number(envValue(env, 'BOLT_ADMIN_SMTP_PORT') || '587');
  const user = envValue(env, 'BOLT_ADMIN_SMTP_USER');
  const pass = envValue(env, 'BOLT_ADMIN_SMTP_PASSWORD');
  const fromAddress = envValue(env, 'BOLT_ADMIN_SMTP_FROM');
  const secure = envValue(env, 'BOLT_ADMIN_SMTP_SECURE') === 'true' || port === 465;
  const configured = Boolean(host && fromAddress && ((user && pass) || (!user && !pass)));

  return {
    configured,
    host,
    port,
    secure,
    user: user || null,
    pass: pass || null,
    fromAddress: fromAddress || null,
    transportLabel: configured ? `SMTP ${host}:${port}` : null,
    reason: configured ? null : 'SMTP is not configured on the runtime service yet.',
  };
}

async function getTransporter() {
  const config = buildAdminMailSupport();

  if (!config.configured) {
    return null;
  }

  if (!transporterPromise) {
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
        .map((line) => line.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])))
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
