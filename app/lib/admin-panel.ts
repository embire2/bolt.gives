export type ClientProfileRecord = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  phone: string | null;
  country: string | null;
  useCase: string | null;
  requestedSubdomain: string | null;
  registrationSource: string | null;
  createdAt: string;
  updatedAt: string;
  lastInstanceSlug: string | null;
  lastInstanceStatus: string | null;
  lastInstanceUrl: string | null;
};

export type AdminMailMessageRecord = {
  id: string;
  profileEmail: string;
  subject: string;
  body: string;
  status: 'draft' | 'sent' | 'failed';
  transport: string | null;
  error: string | null;
  actor: string;
  createdAt: string;
  sentAt: string | null;
};

export type AdminMailSupport = {
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  hasPassword: boolean;
  fromAddress: string | null;
  transportLabel: string | null;
  reason: string | null;
};

export type BugReportRecord = {
  id: string;
  fullName: string;
  reporterEmail: string;
  summary: string;
  issue: string;
  pageUrl: string | null;
  appVersion: string | null;
  provider: string | null;
  model: string | null;
  browser: string | null;
  userAgent: string | null;
  status: 'new' | 'acknowledged' | 'resolved';
  notificationStatus: 'sent' | 'draft' | 'failed';
  notificationTransport: string | null;
  notificationError: string | null;
  createdAt: string;
  notifiedAt: string | null;
};
