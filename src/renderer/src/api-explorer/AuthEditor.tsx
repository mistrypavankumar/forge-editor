import type { AuthConfig } from './types';

const inputCls =
  'rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70';

const AUTH_TYPES: { id: AuthConfig['type']; label: string }[] = [
  { id: 'none', label: 'No Auth' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'basic', label: 'Basic Auth' },
  { id: 'apikey', label: 'API Key' },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-faint">{label}</span>
      {children}
    </label>
  );
}

/**
 * Authorization editor supporting No Auth / Bearer / Basic / API Key. Secret values (token,
 * password, API-key value) are held in memory only — never persisted (see the store's partialize).
 */
export function AuthEditor({
  auth,
  onChange,
}: {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}): React.JSX.Element {
  const patch = (p: Partial<AuthConfig>): void => onChange({ ...auth, ...p });

  return (
    <div className="flex flex-col gap-3">
      <Field label="Auth type">
        <select
          value={auth.type}
          onChange={(e) => patch({ type: e.target.value as AuthConfig['type'] })}
          className={`${inputCls} w-44`}
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {auth.type === 'none' ? (
        <div className="text-[11px] text-faint">This request will be sent without authorization.</div>
      ) : null}

      {auth.type === 'bearer' ? (
        <Field label="Token">
          <input
            type="password"
            value={auth.token ?? ''}
            onChange={(e) => patch({ token: e.target.value })}
            placeholder="paste access token (kept in memory only)"
            className={inputCls}
          />
        </Field>
      ) : null}

      {auth.type === 'basic' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Field label="Username">
              <input
                value={auth.username ?? ''}
                onChange={(e) => patch({ username: e.target.value })}
                placeholder="username"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Password">
              <input
                type="password"
                value={auth.password ?? ''}
                onChange={(e) => patch({ password: e.target.value })}
                placeholder="password (kept in memory only)"
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {auth.type === 'apikey' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Field label="Key">
                <input
                  value={auth.apiKeyName ?? ''}
                  onChange={(e) => patch({ apiKeyName: e.target.value })}
                  placeholder="e.g. X-API-Key"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Value">
                <input
                  type="password"
                  value={auth.apiKeyValue ?? ''}
                  onChange={(e) => patch({ apiKeyValue: e.target.value })}
                  placeholder="value (kept in memory only)"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
          <Field label="Add to">
            <select
              value={auth.apiKeyIn ?? 'header'}
              onChange={(e) => patch({ apiKeyIn: e.target.value as 'header' | 'query' })}
              className={`${inputCls} w-44`}
            >
              <option value="header">Header</option>
              <option value="query">Query param</option>
            </select>
          </Field>
        </div>
      ) : null}

      {auth.type !== 'none' ? (
        <div className="text-[10.5px] text-faint">
          Secrets are not saved to disk — cleared when Forge restarts.
        </div>
      ) : null}
    </div>
  );
}
