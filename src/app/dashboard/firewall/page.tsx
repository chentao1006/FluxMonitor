'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import {
  FIREWALL_LIMITS,
  createBlankRule,
  normalizeFirewallErrorCode,
  parseFirewallStatus,
  parseRuleDraft,
  policiesEqual,
  type FirewallAction,
  type FirewallErrorCode,
  type FirewallPolicy,
  type FirewallProtocol,
  type FirewallRule,
  type FirewallStatus,
} from '@/lib/firewall';
import styles from './page.module.css';

class FirewallRequestError extends Error {
  readonly code: FirewallErrorCode;

  constructor(code: FirewallErrorCode) {
    super(code);
    this.code = code;
  }
}

interface DraftRule {
  id: number;
  rule: FirewallRule;
}

interface DraftPolicy {
  version: 1;
  enabled: boolean;
  rules: DraftRule[];
}

interface FirewallPageState {
  saved: FirewallStatus | null;
  draft: DraftPolicy | null;
  nextRuleId: number;
  busy: boolean;
  conflict: boolean;
  error: FirewallErrorCode | null;
  applied: boolean;
}

type FirewallPageAction =
  | { type: 'request_start' }
  | { type: 'load_success'; snapshot: FirewallStatus; applied: boolean }
  | { type: 'request_error'; error: FirewallErrorCode }
  | { type: 'toggle_rule'; id: number; enabled: boolean }
  | { type: 'move_rule'; id: number; offset: -1 | 1 }
  | { type: 'delete_rule'; id: number }
  | { type: 'commit_rule'; targetId: number | null; rule: FirewallRule }
  | { type: 'discard_local' };

interface RuleEditorState {
  targetId: number | null;
  enabled: boolean;
  action: FirewallAction;
  protocol: FirewallProtocol;
  sourcesText: string;
  portsText: string;
  description: string;
  error: FirewallErrorCode | null;
}

function createDraftFromPolicy(policy: FirewallPolicy, startId: number): { draft: DraftPolicy; nextId: number } {
  let id = startId;
  const rules: DraftRule[] = policy.rules.map((rule) => ({
    id: id++,
    rule: { ...rule, sources: [...rule.sources] },
  }));
  return {
    draft: { version: 1, enabled: policy.enabled, rules },
    nextId: id,
  };
}

function toFirewallPolicy(draft: DraftPolicy): FirewallPolicy {
  return {
    version: 1,
    enabled: draft.enabled,
    rules: draft.rules.map((entry) => entry.rule),
  };
}

const initialState: FirewallPageState = {
  saved: null,
  draft: null,
  nextRuleId: 1,
  busy: true,
  conflict: false,
  error: null,
  applied: false,
};

function firewallReducer(state: FirewallPageState, action: FirewallPageAction): FirewallPageState {
  switch (action.type) {
    case 'request_start':
      return {
        ...state,
        busy: true,
        error: null,
        applied: false,
      };
    case 'load_success': {
      const { draft, nextId } = createDraftFromPolicy(action.snapshot.policy, state.nextRuleId);
      return {
        saved: action.snapshot,
        draft,
        nextRuleId: nextId,
        busy: false,
        conflict: false,
        error: null,
        applied: action.applied,
      };
    }
    case 'request_error':
      return {
        ...state,
        busy: false,
        error: action.error,
        conflict: action.error === 'conflict' || state.conflict,
        applied: false,
      };
    case 'toggle_rule': {
      if (!state.draft) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          rules: state.draft.rules.map((entry) =>
            entry.id === action.id ? { ...entry, rule: { ...entry.rule, enabled: action.enabled } } : entry
          ),
        },
        applied: false,
        error: state.conflict ? state.error : null,
      };
    }
    case 'move_rule': {
      if (!state.draft) {
        return state;
      }
      const index = state.draft.rules.findIndex((entry) => entry.id === action.id);
      const targetIndex = index + action.offset;
      if (index === -1 || targetIndex < 0 || targetIndex >= state.draft.rules.length) {
        return state;
      }
      const nextRules = [...state.draft.rules];
      const [moved] = nextRules.splice(index, 1);
      nextRules.splice(targetIndex, 0, moved);
      return {
        ...state,
        draft: { ...state.draft, rules: nextRules },
        applied: false,
        error: state.conflict ? state.error : null,
      };
    }
    case 'delete_rule': {
      if (!state.draft) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          rules: state.draft.rules.filter((entry) => entry.id !== action.id),
        },
        applied: false,
        error: state.conflict ? state.error : null,
      };
    }
    case 'commit_rule': {
      if (!state.draft) {
        return state;
      }
      if (action.targetId === null) {
        return {
          ...state,
          draft: {
            ...state.draft,
            rules: [...state.draft.rules, { id: state.nextRuleId, rule: action.rule }],
          },
          nextRuleId: state.nextRuleId + 1,
          applied: false,
          error: state.conflict ? state.error : null,
        };
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          rules: state.draft.rules.map((entry) =>
            entry.id === action.targetId ? { ...entry, rule: action.rule } : entry
          ),
        },
        applied: false,
        error: state.conflict ? state.error : null,
      };
    }
    case 'discard_local': {
      if (!state.saved) {
        return state;
      }
      const { draft, nextId } = createDraftFromPolicy(state.saved.policy, state.nextRuleId);
      return {
        ...state,
        draft,
        nextRuleId: nextId,
        error: null,
        applied: false,
      };
    }
  }
}

async function requestFirewallStatus(options?: RequestInit): Promise<FirewallStatus> {
  let response: Response;
  try {
    response = await fetch('/api/firewall', { cache: 'no-store', ...options });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new FirewallRequestError('unavailable');
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    throw new FirewallRequestError(normalizeFirewallErrorCode(undefined, response.status));
  }
  if (response.ok) {
    const parsed = parseFirewallStatus(data);
    if (parsed.ok) {
      return parsed.value;
    }
    throw new FirewallRequestError(parsed.error);
  }
  const rawError = data && typeof data === 'object' && 'error' in data ? (data as { error?: unknown }).error : undefined;
  throw new FirewallRequestError(normalizeFirewallErrorCode(rawError, response.status));
}

export default function FirewallPage() {
  const { t } = useLanguage();
  const f = t.firewall;
  const [state, dispatch] = useReducer(firewallReducer, initialState);
  const [editor, setEditor] = useState<RuleEditorState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestFirewallStatus({ signal: controller.signal })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'load_success', snapshot, applied: false });
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const code = reason instanceof FirewallRequestError ? reason.code : 'unavailable';
        dispatch({ type: 'request_error', error: code });
      });
    return () => controller.abort();
  }, []);

  const isEditorOpen = editor !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (isEditorOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isEditorOpen && dialog.open) {
      dialog.close();
    }
  }, [isEditorOpen]);

  const draftPolicy = state.draft ? toFirewallPolicy(state.draft) : null;
  const dirty = state.saved !== null && draftPolicy !== null && !policiesEqual(draftPolicy, state.saved.policy);

  async function reloadStatus(install = false) {
    dispatch({ type: 'request_start' });
    try {
      const snapshot = await requestFirewallStatus({ method: install ? 'POST' : 'GET' });
      dispatch({ type: 'load_success', snapshot, applied: false });
    } catch (reason: unknown) {
      const code = reason instanceof FirewallRequestError ? reason.code : 'unavailable';
      dispatch({ type: 'request_error', error: code });
    }
  }

  async function applyChanges(policy = draftPolicy) {
    if (!state.saved || !policy) {
      return;
    }
    dispatch({ type: 'request_start' });
    try {
      const snapshot = await requestFirewallStatus({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: state.saved.revision, policy }),
      });
      dispatch({ type: 'load_success', snapshot, applied: true });
    } catch (reason: unknown) {
      const code = reason instanceof FirewallRequestError ? reason.code : 'unavailable';
      dispatch({ type: 'request_error', error: code });
    }
  }

  function handleDiscard() {
    if (state.conflict) {
      void reloadStatus();
      return;
    }
    dispatch({ type: 'discard_local' });
  }

  function openNewRuleEditor() {
    const blank = createBlankRule();
    setEditor({
      targetId: null,
      enabled: blank.enabled,
      action: blank.action,
      protocol: blank.protocol,
      sourcesText: blank.sources.join('\n'),
      portsText: blank.ports,
      description: blank.description,
      error: null,
    });
  }

  function openExistingRuleEditor(entry: DraftRule) {
    setEditor({
      targetId: entry.id,
      enabled: entry.rule.enabled,
      action: entry.rule.action,
      protocol: entry.rule.protocol,
      sourcesText: entry.rule.sources.join('\n'),
      portsText: entry.rule.ports,
      description: entry.rule.description,
      error: null,
    });
  }

  function updateEditor(patch: Partial<Omit<RuleEditorState, 'error'>>) {
    setEditor((prev) => (prev ? { ...prev, ...patch, error: null } : null));
  }

  function handleEditorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) {
      return;
    }
    const parsed = parseRuleDraft({
      enabled: editor.enabled,
      action: editor.action,
      protocol: editor.protocol,
      sourcesText: editor.sourcesText,
      portsText: editor.portsText,
      description: editor.description,
    });
    if (!parsed.ok) {
      setEditor({ ...editor, error: parsed.error });
      return;
    }
    dispatch({ type: 'commit_rule', targetId: editor.targetId, rule: parsed.value });
    setEditor(null);
  }

  const errorMessages: Record<FirewallErrorCode, string> = {
    unauthorized: t.common.errors.accessDenied,
    forbidden: t.common.errors.accessDenied,
    setup_required: f.setup,
    permission_denied: f.permissionDenied,
    upgrade_required: f.upgrade,
    unavailable: f.unavailable,
    conflict: f.conflict,
    management_access: f.blocked,
    invalid_request: f.invalid,
    unsupported_media_type: f.invalid,
    request_size: f.limit,
    policy: f.invalid,
    rule: f.invalid,
    rule_limit: f.limit,
    port: f.invalid,
    sources: f.invalid,
    source_address: f.invalid,
  };

  const showInstallButton = state.error === 'setup_required' || state.error === 'permission_denied' || state.error === 'upgrade_required';

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div className={styles.titleGroup}>
          <div className={`icon-container ${styles.iconBox}`}>
            <Shield size={24} color="var(--color-primary)" aria-hidden="true" />
          </div>
          <h1 className={`card-title ${styles.pageTitle}`}>{t.sidebar.firewall}</h1>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={state.busy || (dirty && !state.conflict)}
          onClick={() => void reloadStatus()}
        >
          <RefreshCw size={16} />
          {state.conflict ? f.reload : t.common.refresh}
        </button>
      </header>

      {state.error && (
        <div role="alert" className={styles.error}>
          <span>{errorMessages[state.error]}</span>
          {showInstallButton && (
            <button type="button" className="btn btn-primary" disabled={state.busy} onClick={() => void reloadStatus(true)}>
              {f.install}
            </button>
          )}
        </div>
      )}

      {!state.saved && state.busy && <p role="status">{t.common.loading}</p>}

      {state.saved && state.draft && (
        <>
          <div className={`glass-panel ${styles.summary}`}>
            <div>
              <small>{f.system}</small>
              <strong>{state.saved.pfEnabled ? t.common.enabled : t.common.disabled}</strong>
            </div>
            <div>
              <small>{f.rules}</small>
              <strong>
                {state.saved.policy.enabled ? t.common.enabled : t.common.disabled} ·{' '}
                {state.saved.inSync ? f.synced : f.drift}
              </strong>
            </div>
            {draftPolicy && (
              <div className={styles.summaryAction}>
                {/* One click: switch the rules on or off (with any pending edits) and apply; PF follows. */}
                <button
                  type="button"
                  className={state.saved.policy.enabled ? 'btn btn-danger' : 'btn btn-success'}
                  disabled={state.busy || state.conflict || (!state.saved.policy.enabled && !state.saved.attached)}
                  onClick={() => {
                    const enabled = !state.saved!.policy.enabled;
                    if (!enabled && !window.confirm(f.disableConfirm)) return;
                    void applyChanges({ ...draftPolicy, enabled });
                  }}
                >
                  {state.busy ? t.common.saving : state.saved.policy.enabled ? f.disableNow : f.enableNow}
                </button>
              </div>
            )}
          </div>

          {!state.saved.attached && (
            <p role="alert" className={styles.error}>
              {f.missing}
            </p>
          )}

          <section className={`card glass-panel ${styles.panel}`}>
            <div className={styles.heading}>
              <h2>{f.rules}</h2>
            </div>

            <p className={styles.hint}>{f.orderHint}</p>

            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {[
                      { id: 'order', label: f.order },
                      { id: 'action', label: f.action },
                      { id: 'protocol', label: f.protocol },
                      { id: 'sources', label: f.sources },
                      { id: 'destination', label: f.destination },
                      { id: 'ports', label: f.ports },
                      { id: 'description', label: f.description },
                      { id: 'enabled', label: t.common.enabled },
                      { id: 'actions', label: t.common.actions },
                    ].map((column) => (
                      <th key={column.id} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.draft.rules.map((entry, index) => (
                    <tr key={entry.id} className={!entry.rule.enabled ? styles.disabled : undefined}>
                      <td>{index + 1}</td>
                      <td>
                        <span className={entry.rule.action === 'allow' ? styles.allow : styles.deny}>
                          {f[entry.rule.action]}
                        </span>
                      </td>
                      <td>{entry.rule.protocol.toUpperCase()}</td>
                      <td className={styles.networks}>
                        {entry.rule.sources[0] === 'any' ? f.any : entry.rule.sources.join(', ')}
                      </td>
                      <td>{f.host}</td>
                      <td className={styles.ports}>{entry.rule.ports === '*' ? f.any : entry.rule.ports}</td>
                      <td className={styles.note}>{entry.rule.description}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${t.common.enabled} ${index + 1}`}
                          checked={entry.rule.enabled}
                          disabled={state.busy || state.conflict}
                          onChange={(event) =>
                            dispatch({ type: 'toggle_rule', id: entry.id, enabled: event.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <div className={styles.icons}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`${f.up} ${index + 1}`}
                            title={f.up}
                            disabled={state.busy || state.conflict || index === 0}
                            onClick={() => dispatch({ type: 'move_rule', id: entry.id, offset: -1 })}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`${f.down} ${index + 1}`}
                            title={f.down}
                            disabled={state.busy || state.conflict || index + 1 === state.draft!.rules.length}
                            onClick={() => dispatch({ type: 'move_rule', id: entry.id, offset: 1 })}
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`${t.common.edit} ${index + 1}`}
                            title={t.common.edit}
                            disabled={state.busy || state.conflict}
                            onClick={() => openExistingRuleEditor(entry)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`${t.common.delete} ${index + 1}`}
                            title={t.common.delete}
                            disabled={state.busy || state.conflict}
                            onClick={() => dispatch({ type: 'delete_rule', id: entry.id })}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {state.draft.rules.length === 0 && (
                    <tr>
                      <td colSpan={9}>{f.empty}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={state.busy || state.conflict || state.draft.rules.length >= FIREWALL_LIMITS.maxRules}
                onClick={openNewRuleEditor}
              >
                <Plus size={16} />
                {f.add}
              </button>
              <div className={styles.buttons}>
                {(dirty || state.conflict) && (
                  <>
                    {dirty && <span className={styles.hint}>{f.pending}</span>}
                    <button type="button" className="btn btn-ghost" disabled={state.busy} onClick={handleDiscard}>
                      {f.discard}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    state.busy ||
                    state.conflict ||
                    (!dirty && state.saved.inSync) ||
                    (state.draft.enabled && !state.saved.attached)
                  }
                  onClick={() => void applyChanges()}
                >
                  {state.busy ? t.common.saving : f.apply}
                </button>
              </div>
            </div>

            {state.applied && (
              <p role="status" className={styles.success}>
                {t.common.saveSuccess}
              </p>
            )}
          </section>

          {editor && (
            <dialog
              ref={dialogRef}
              aria-labelledby="firewall-editor-title"
              className={styles.dialog}
              onCancel={(event) => {
                event.preventDefault();
                setEditor(null);
              }}
            >
              <form noValidate onSubmit={handleEditorSubmit}>
                <h2 id="firewall-editor-title">{editor.targetId === null ? f.add : t.common.edit}</h2>
                {editor.error && (
                  <p role="alert" className={styles.error}>
                    {errorMessages[editor.error]}
                  </p>
                )}
                <div className={styles.fields}>
                  <label>
                    {f.action}
                    <select
                      value={editor.action}
                      onChange={(event) =>
                        updateEditor({ action: event.target.value === 'deny' ? 'deny' : 'allow' })
                      }
                    >
                      <option value="allow">{f.allow}</option>
                      <option value="deny">{f.deny}</option>
                    </select>
                  </label>
                  <label>
                    {f.protocol}
                    <select
                      value={editor.protocol}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateEditor({
                          protocol: value === 'udp' ? 'udp' : value === 'tcp/udp' ? 'tcp/udp' : 'tcp',
                        });
                      }}
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                      <option value="tcp/udp">TCP/UDP</option>
                    </select>
                  </label>
                </div>
                <label>
                  {f.sources}
                  <textarea
                    autoFocus
                    rows={3}
                    placeholder="192.0.2.7, 2001:db8::/64"
                    value={editor.sourcesText}
                    onChange={(event) => updateEditor({ sourcesText: event.target.value })}
                  />
                </label>
                <small>{f.sourceHint}</small>
                <div className={styles.fields}>
                  <label>
                    {f.destination}
                    <input value={f.host} readOnly />
                  </label>
                  <label>
                    {f.ports}
                    <input
                      value={editor.portsText}
                      placeholder="80, 443, 8000-8010"
                      onChange={(event) => updateEditor({ portsText: event.target.value })}
                    />
                  </label>
                </div>
                <small>{f.portHint}</small>
                <label>
                  {f.description}
                  <input
                    maxLength={FIREWALL_LIMITS.maxDescriptionLength}
                    value={editor.description}
                    onChange={(event) => updateEditor({ description: event.target.value })}
                  />
                </label>
                <div className={styles.buttons}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)}>
                    {t.common.cancel}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {t.common.confirm}
                  </button>
                </div>
              </form>
            </dialog>
          )}
        </>
      )}
    </div>
  );
}
