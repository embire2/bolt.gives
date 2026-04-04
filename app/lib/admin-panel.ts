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
  fromAddress: string | null;
  transportLabel: string | null;
  reason: string | null;
};
