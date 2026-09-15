// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Cookies from 'js-cookie';
import {
  getApiKeysFromCookies,
  loadApiKeysFromSecureStorage,
  reconcileApiKeyOwner,
  removeApiKeysCookie,
  setApiKeysCookie,
  subscribeToApiKeyChanges,
} from './api-key-storage';

beforeEach(() => {
  removeApiKeysCookie();
  localStorage.clear();
});
describe('account-owned provider keys', () => {
  it('does not adopt legacy unowned keys or encrypted envelopes', async () => {
    Cookies.set('apiKeys', JSON.stringify({ Example: 'dummy' }));
    localStorage.setItem('cody-agent:api-keys:v1', 'legacy');
    expect(getApiKeysFromCookies('alice')).toEqual({});
    expect(await loadApiKeysFromSecureStorage('alice')).toEqual({});
    expect(localStorage.getItem('cody-agent:api-keys:v1')).toBeNull();
  });
  it('returns keys only for their owner and clears them on account change', () => {
    setApiKeysCookie({ Example: 'dummy-alice' }, 365, 'alice');
    expect(getApiKeysFromCookies('alice')).toEqual({ Example: 'dummy-alice' });
    expect(getApiKeysFromCookies('bob')).toEqual({});
    reconcileApiKeyOwner('bob');
    expect(getApiKeysFromCookies('alice')).toEqual({});
  });
  it('does not restore credentials after a server logout cleared the cookies', async () => {
    setApiKeysCookie({ Example: 'dummy-alice' }, 365, 'alice');
    Cookies.remove('apiKeys', { path: '/' });
    Cookies.remove('bolt_api_key_owner', { path: '/' });
    expect(await loadApiKeysFromSecureStorage('alice')).toEqual({});
  });
  it('notifies active views and other tabs without broadcasting keys', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToApiKeyChanges(callback);
    setApiKeysCookie({ Example: 'dummy-alice' }, 365, 'alice');
    expect(callback).toHaveBeenCalled();
    expect(localStorage.getItem('bolt-api-key-change')).not.toContain('dummy-alice');
    window.dispatchEvent(new StorageEvent('storage', { key: 'bolt-api-key-change' }));
    expect(callback).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it('rejects a delayed old-account model callback after logout or another tab signs in', () => {
    localStorage.setItem('bolt-profile-owner', 'bob');
    expect(setApiKeysCookie({ Example: 'dummy-alice' }, 365, 'alice')).toBe(false);
    expect(Cookies.get('apiKeys')).toBeUndefined();
    localStorage.setItem('bolt-profile-owner', 'guest');
    expect(setApiKeysCookie({ Example: 'dummy-alice' }, 365, 'alice')).toBe(false);
  });
});
