import { Form } from '@remix-run/react';

export function InstancePolicy({ enabled }: { enabled: boolean }) {
  return (
    <Form
      method="post"
      className="my-5 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
    >
      <input type="hidden" name="intent" value="instance-policy" />
      <label className="flex items-center gap-3 font-semibold text-bolt-elements-textPrimary">
        <input type="checkbox" name="singleInstancePerUser" defaultChecked={enabled} key={String(enabled)} />
        Limit each account to one managed instance
      </label>
      <p className="mt-2 text-sm text-bolt-elements-textSecondary">
        Applies to new requests across browsers. Existing instances are preserved. Turn this off to allow additional
        instances.
      </p>
      <button
        type="submit"
        className="mt-3 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-semibold text-bolt-elements-button-primary-text"
      >
        Save instance policy
      </button>
    </Form>
  );
}
