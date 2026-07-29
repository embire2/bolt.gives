import { createContext, useContext, type ReactNode } from 'react';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  country: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

const ProfileContext = createContext<UserProfile | null>(null);

export function ProfileProvider({ profile, children }: { profile: UserProfile | null; children: ReactNode }) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function getProfileFirstName(profile: UserProfile | null) {
  return profile?.name.trim().split(/\s+/)[0] || '';
}
