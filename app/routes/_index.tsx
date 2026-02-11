import { json, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { useEffect } from 'react';
import { providersStore } from '~/lib/stores/settings';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

export const loader = ({ context }: { context: any }) => {
  // Check which local providers are configured
  const configuredProviders: string[] = [];

  // Check Ollama
  if (context.cloudflare?.env?.OLLAMA_API_BASE_URL || process.env?.OLLAMA_API_BASE_URL) {
    configuredProviders.push('Ollama');
  }

  // Check LMStudio
  if (context.cloudflare?.env?.LMSTUDIO_API_BASE_URL || process.env?.LMSTUDIO_API_BASE_URL) {
    configuredProviders.push('LMStudio');
  }

  // Check OpenAILike
  if (context.cloudflare?.env?.OPENAI_LIKE_API_BASE_URL || process.env?.OPENAI_LIKE_API_BASE_URL) {
    configuredProviders.push('OpenAILike');
  }

  return json({ configuredProviders });
};

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  const data = useLoaderData<{ configuredProviders: string[] }>();

  useEffect(() => {
    // Enable configured providers if they haven't been manually configured yet
    if (data?.configuredProviders && data.configuredProviders.length > 0) {
      const savedSettings = localStorage.getItem('provider_settings');

      if (!savedSettings) {
        // No saved settings, so enable the configured providers
        const currentProviders = providersStore.get();
        data.configuredProviders.forEach((providerName) => {
          if (currentProviders[providerName]) {
            providersStore.setKey(providerName, {
              ...currentProviders[providerName],
              settings: {
                ...currentProviders[providerName].settings,
                enabled: true,
              },
            });
          }
        });

        // Save to localStorage so this only happens once
        localStorage.setItem('provider_settings', JSON.stringify(providersStore.get()));
      }
    }
  }, [data?.configuredProviders]);

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
