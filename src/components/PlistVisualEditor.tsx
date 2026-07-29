import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Plus, ChevronDown, Wrench } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export type PlistNodeType = 'string' | 'integer' | 'real' | 'boolean' | 'array' | 'dict';

export interface PlistNode {
  type: PlistNodeType;
  value: unknown;
}

const PLIST_DOCTYPE = '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';

function repairPlistXml(xml: string): string {
  // A malformed plist DOCTYPE is a common copy-and-paste error. Replacing only
  // that declaration keeps the user's service configuration untouched.
  return xml.replace(/<!DOCTYPE\s+plist\b[\s\S]*?>/i, PLIST_DOCTYPE);
}

function getXmlParseError(parseError: Element): string {
  const message = parseError.textContent?.replace(/\s+/g, ' ').trim() || 'Unknown XML syntax error';
  const location = message.match(/(?:line|Line)\s*(\d+).*?(?:column|Column|col)\s*(\d+)/);
  return location
    ? `XML syntax error at line ${location[1]}, column ${location[2]}: ${message}`
    : `XML syntax error: ${message}`;
}

export function parsePlistXml(xml: string): PlistNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(getXmlParseError(parseError));
  }

  const rootPlist = doc.documentElement;
  if (rootPlist.tagName !== 'plist') {
    throw new Error("Root element is not <plist>");
  }

  const rootElement = rootPlist.firstElementChild;
  if (!rootElement) {
    return { type: 'dict', value: [] };
  }

  return parseElement(rootElement);
}

function parseElement(el: Element): PlistNode {
  const tag = el.tagName;
  switch (tag) {
    case 'string':
      return { type: 'string', value: el.textContent || '' };
    case 'integer':
      return { type: 'integer', value: parseInt(el.textContent || '0', 10) };
    case 'real':
      return { type: 'real', value: parseFloat(el.textContent || '0') };
    case 'true':
      return { type: 'boolean', value: true };
    case 'false':
      return { type: 'boolean', value: false };
    case 'array': {
      const arr: PlistNode[] = [];
      for (let i = 0; i < el.children.length; i++) {
        arr.push(parseElement(el.children[i]));
      }
      return { type: 'array', value: arr };
    }
    case 'dict': {
      const dictArr: { key: string; node: PlistNode }[] = [];
      let currentKey: string | null = null;
      for (let i = 0; i < el.children.length; i++) {
        const child = el.children[i];
        if (child.tagName === 'key') {
          currentKey = child.textContent || '';
        } else if (currentKey !== null) {
          dictArr.push({ key: currentKey, node: parseElement(child) });
          currentKey = null;
        }
      }
      return { type: 'dict', value: dictArr };
    }
    default:
      return { type: 'string', value: el.textContent || '' };
  }
}

function buildPlistXmlString(node: PlistNode, indentLevel = 0): string {
  const indent = '    '.repeat(indentLevel);
  switch (node.type) {
    case 'string':
      return `${indent}<string>${escapeXml(String(node.value))}</string>`;
    case 'integer':
      return `${indent}<integer>${Math.floor(Number(node.value) || 0)}</integer>`;
    case 'real':
      return `${indent}<real>${Number(node.value) || 0}</real>`;
    case 'boolean':
      return `${indent}<${node.value ? 'true' : 'false'}/>`;
    case 'array': {
      const arr = node.value as PlistNode[];
      if (arr.length === 0) return `${indent}<array/>`;
      const inner = arr.map(child => buildPlistXmlString(child, indentLevel + 1)).join('\n');
      return `${indent}<array>\n${inner}\n${indent}</array>`;
    }
    case 'dict': {
      const dictArr = node.value as { key: string; node: PlistNode }[];
      if (dictArr.length === 0) return `${indent}<dict/>`;
      const inner = dictArr.map(item => {
        const keyStr = `${indent}    <key>${escapeXml(item.key)}</key>`;
        const valStr = buildPlistXmlString(item.node, indentLevel + 1);
        return `${keyStr}\n${valStr}`;
      }).join('\n');
      return `${indent}<dict>\n${inner}\n${indent}</dict>`;
    }
  }
}

function escapeXml(unsafe: string) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

export function createFullPlistXml(node: PlistNode) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${PLIST_DOCTYPE}\n<plist version="1.0">\n${buildPlistXmlString(node, 0)}\n</plist>`;
}

const typeOptions: PlistNodeType[] = ['string', 'integer', 'real', 'boolean', 'array', 'dict'];

function getDefaultValueForType(type: PlistNodeType): unknown {
  switch(type) {
    case 'string': return '';
    case 'integer': return 0;
    case 'real': return 0.0;
    case 'boolean': return false;
    case 'array': return [];
    case 'dict': return [];
  }
}

interface NodeEditorProps {
  node: PlistNode;
  onChange: (newNode: PlistNode) => void;
  isRoot?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

const LAUNCH_AGENT_KEYS = [
  'Label', 'Program', 'ProgramArguments', 'RunAtLoad', 'KeepAlive', 
  'StartInterval', 'StartCalendarInterval', 'StandardOutPath', 
  'StandardErrorPath', 'EnvironmentVariables', 'WorkingDirectory', 
  'RootDirectory', 'UserName', 'GroupName', 'InitGroups', 'Umask', 
  'TimeOut', 'ExitTimeOut', 'ThrottleInterval', 'ProcessType', 'Nice', 
  'AbandonProcessGroup', 'LowPriorityIO', 'LaunchOnlyOnce', 
  'MachServices', 'Sockets', 'WatchPaths', 'LimitLoadToSessionType', 
  'AssociatedBundleIdentifiers', 'Disabled'
];

const RootKeyCombobox = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: '120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
        <input 
          className="input" 
          style={{ width: '100%', padding: '0.4rem', paddingRight: '1.5rem', fontSize: '0.85rem' }}
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Key"
        />
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ position: 'absolute', right: '0.4rem', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}
        >
          <ChevronDown size={14} />
        </div>
      </div>
      
      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--color-surface-bg)', border: '1px solid var(--color-surface-border)', maxHeight: '250px', overflowY: 'auto', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', marginTop: '4px' }}>
          {LAUNCH_AGENT_KEYS.map(opt => (
            <div 
              key={opt}
              style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text)' }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setIsOpen(false);
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NodeEditor: React.FC<NodeEditorProps> = ({ node, onChange, isRoot, t }) => {
  if (node.type === 'dict') {
    const list = node.value as { key: string; node: PlistNode }[];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        {list.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1rem', borderLeft: '2px solid var(--color-surface-border)', paddingTop: '0.25rem', paddingBottom: '0.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              {isRoot ? (
                <RootKeyCombobox 
                  value={item.key}
                  onChange={(val) => {
                    const newList = [...list];
                    newList[idx].key = val;
                    onChange({ ...node, value: newList });
                  }}
                />
              ) : (
                <input 
                  className="input" 
                  style={{ flex: 1, minWidth: '120px', padding: '0.4rem', fontSize: '0.85rem' }} 
                  value={item.key} 
                  onChange={e => {
                    const newList = [...list];
                    newList[idx].key = e.target.value;
                    onChange({ ...node, value: newList });
                  }} 
                  placeholder="Key" 
                />
              )}
              <select 
                className="input" 
                style={{ width: '100px', padding: '0.4rem', fontSize: '0.85rem' }}
                value={item.node.type}
                onChange={e => {
                  const newType = e.target.value as PlistNodeType;
                  const newList = [...list];
                  newList[idx].node = { type: newType, value: getDefaultValueForType(newType) };
                  onChange({ ...node, value: newList });
                }}
              >
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              
              <div style={{ flex: 2, display: 'flex', minWidth: 0 }}>
                {['string', 'integer', 'real'].includes(item.node.type) && (
                  <input 
                    className="input" 
                    type={item.node.type === 'string' ? 'text' : 'number'}
                    style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
                    value={item.node.value as string | number}
                    onChange={e => {
                      const newList = [...list];
                      const val = item.node.type === 'string' ? e.target.value : Number(e.target.value);
                      newList[idx].node = { ...item.node, value: val };
                      onChange({ ...node, value: newList });
                    }}
                  />
                )}
                {item.node.type === 'boolean' && (
                  <div style={{ display: 'flex', alignItems: 'center', height: '32px', paddingLeft: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      checked={!!item.node.value}
                      onChange={e => {
                        const newList = [...list];
                        newList[idx].node = { ...item.node, value: e.target.checked };
                        onChange({ ...node, value: newList });
                      }}
                      style={{ cursor: 'pointer', width: '1.2rem', height: '1.2rem' }}
                    />
                  </div>
                )}
                {['dict', 'array'].includes(item.node.type) && (
                  <div style={{ flex: 1, marginTop: '0.25rem' }}>
                    <NodeEditor node={item.node} onChange={newNode => {
                      const newList = [...list];
                      newList[idx].node = newNode;
                      onChange({ ...node, value: newList });
                    }} isRoot={false} t={t} />
                  </div>
                )}
              </div>
              <button 
                className="btn btn-ghost btn-icon" 
                style={{ padding: '0.4rem', color: 'var(--color-danger)', marginTop: '2px' }}
                onClick={() => {
                  const newList = list.filter((_, i) => i !== idx);
                  onChange({ ...node, value: newList });
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        <button 
          className="btn btn-ghost btn-sm" 
          style={{ alignSelf: 'flex-start', color: 'var(--color-primary)', marginTop: '0.25rem' }}
          onClick={() => {
            const newList = [...list, { key: 'NewKey', node: { type: 'string', value: '' } }];
            onChange({ ...node, value: newList });
          }}
        >
          <Plus size={14} style={{ marginRight: '4px' }} /> {t.launchagent.addKey || 'Add Key'}
        </button>
      </div>
    );
  } else if (node.type === 'array') {
    const list = node.value as PlistNode[];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        {list.map((itemNode, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', paddingLeft: '1rem', borderLeft: '2px solid var(--color-surface-border)', paddingTop: '0.25rem', paddingBottom: '0.25rem' }}>
            <span style={{ padding: '0.4rem 0', color: 'var(--color-text-muted)', fontSize: '0.8rem', minWidth: '20px', textAlign: 'right' }}>{idx}</span>
            <select 
              className="input" 
              style={{ width: '100px', padding: '0.4rem', fontSize: '0.85rem' }}
              value={itemNode.type}
              onChange={e => {
                const newType = e.target.value as PlistNodeType;
                const newList = [...list];
                newList[idx] = { type: newType, value: getDefaultValueForType(newType) };
                onChange({ ...node, value: newList });
              }}
            >
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                {['string', 'integer', 'real'].includes(itemNode.type) && (
                  <input 
                    className="input" 
                    type={itemNode.type === 'string' ? 'text' : 'number'}
                    style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
                    value={itemNode.value as string | number}
                    onChange={e => {
                      const newList = [...list];
                      const val = itemNode.type === 'string' ? e.target.value : Number(e.target.value);
                      newList[idx] = { ...itemNode, value: val };
                      onChange({ ...node, value: newList });
                    }}
                  />
                )}
                {itemNode.type === 'boolean' && (
                  <div style={{ display: 'flex', alignItems: 'center', height: '32px', paddingLeft: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      checked={!!itemNode.value}
                      onChange={e => {
                        const newList = [...list];
                        newList[idx] = { ...itemNode, value: e.target.checked };
                        onChange({ ...node, value: newList });
                      }}
                      style={{ cursor: 'pointer', width: '1.2rem', height: '1.2rem' }}
                    />
                  </div>
                )}
                {['dict', 'array'].includes(itemNode.type) && (
                  <div style={{ flex: 1, marginTop: '0.25rem' }}>
                    <NodeEditor node={itemNode} onChange={newNode => {
                      const newList = [...list];
                      newList[idx] = newNode;
                      onChange({ ...node, value: newList });
                    }} isRoot={false} t={t} />
                  </div>
                )}
            </div>
            <button 
              className="btn btn-ghost btn-icon" 
              style={{ padding: '0.4rem', color: 'var(--color-danger)', marginTop: '2px' }}
              onClick={() => {
                const newList = list.filter((_, i) => i !== idx);
                onChange({ ...node, value: newList });
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button 
          className="btn btn-ghost btn-sm" 
          style={{ alignSelf: 'flex-start', color: 'var(--color-primary)', marginTop: '0.25rem' }}
          onClick={() => {
            const newList = [...list, { type: 'string', value: '' }];
            onChange({ ...node, value: newList });
          }}
        >
          <Plus size={14} style={{ marginRight: '4px' }} /> {t.launchagent.addItem || 'Add Item'}
        </button>
      </div>
    );
  } else {
    return (
      <div style={{ padding: '1rem', color: 'var(--color-text-muted)' }}>
        {t.launchagent.rootIsPrimitive || 'Root node is a primitive. Please edit in code mode.'}
      </div>
    );
  }
}

interface PlistVisualEditorProps {
  xml: string;
  onChange: (xml: string) => void;
}

export const PlistVisualEditor: React.FC<PlistVisualEditorProps> = ({ xml, onChange }) => {
  const { t } = useLanguage();
  const [rootNode, setRootNode] = useState<PlistNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastEmittedXml = useRef<string>('');

  useEffect(() => {
    if (xml === lastEmittedXml.current) return;
    if (xml === 'Loading...' || xml === t.common.loading || !xml.trim().startsWith('<')) {
      return;
    }

    try {
      const parsed = parsePlistXml(xml);
      setTimeout(() => {
        setRootNode(parsed);
        setError(null);
      }, 0);
      lastEmittedXml.current = xml;
    } catch (e: unknown) { const err = e as { message?: string };
      setTimeout(() => {
        setError(err.message || 'Failed to parse XML');
        setRootNode(null);
      }, 0);
    }
  }, [xml, t.common.loading]);

  const handleChange = useCallback((newNode: PlistNode) => {
    setRootNode(newNode);
    const newXml = createFullPlistXml(newNode);
    lastEmittedXml.current = newXml;
    onChange(newXml);
  }, [onChange]);

  const handleRepair = useCallback(() => {
    const repairedXml = repairPlistXml(xml);
    try {
      const parsed = parsePlistXml(repairedXml);
      lastEmittedXml.current = repairedXml;
      setRootNode(parsed);
      setError(null);
      onChange(repairedXml);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Failed to parse XML');
    }
  }, [xml, onChange]);

  let canRepair = false;
  if (error) {
    const repairedXml = repairPlistXml(xml);
    if (repairedXml !== xml) {
      try {
        parsePlistXml(repairedXml);
        canRepair = true;
      } catch {
        // The document still has an error after the safe repair, so do not
        // offer a button that cannot complete successfully.
      }
    }
  }

  if (error) {
    return (
       <div style={{ padding: '2rem', color: 'var(--color-danger)' }}>
         <div>{t.launchagent.parseError || 'Parse Error'}: {error}. {t.launchagent.fixInCodeMode || 'Please fix XML syntax in Code Mode.'}</div>
         {canRepair && (
           <button
             type="button"
             className="btn btn-sm"
             style={{ marginTop: '1rem' }}
             onClick={handleRepair}
           >
             <Wrench size={14} style={{ marginRight: '4px' }} />
             {t.launchagent.repairXml || 'Repair XML'}
           </button>
         )}
       </div>
    );
  }

  if (!rootNode) return null;

  return (
    <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
      <NodeEditor node={rootNode} onChange={handleChange} isRoot={true} t={t} />
    </div>
  );
}
