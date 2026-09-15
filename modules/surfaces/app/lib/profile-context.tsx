import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { reconcileApiKeyOwner } from '@bolt/agent/lib/runtime/api-key-storage';

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
const SingleUserContext = createContext(false);
export const useSingleUserMode = () => useContext(SingleUserContext);

export function ProfileProvider({
  profile,
  children,
  singleUser = false,
}: {
  profile: UserProfile | null;
  children: ReactNode;
  singleUser?: boolean;
}) {
  useEffect(() => {
    reconcileApiKeyOwner(profile?.id);

    try {
      localStorage.setItem('bolt-profile-owner', profile?.id || 'guest');
    } catch {
      /* Storage may be restricted. */
    }
  }, [profile?.id]);
  return (
    <SingleUserContext.Provider value={singleUser}>
      <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>
    </SingleUserContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function getProfileFirstName(profile: UserProfile | null) {
  return profile?.name.trim().split(/\s+/)[0] || '';
}
