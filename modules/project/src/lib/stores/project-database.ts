import { atom } from 'nanostores';
import type { HostedProjectConnection } from '@bolt/runtime/lib/runtime/hosted-runtime-client';

export const projectDatabaseConnection = atom<HostedProjectConnection | null>(null);
