// CreateExpertModal — 新建专家库专家
// 调用 POST /api/v1/expert-library/experts

import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (expertId: string) => void;
}

export function CreateExpertModal({ open, onClose, onCreated }: Props) {
  const [expertId, setExpertId] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [personaStyle, setPersonaStyle] = useState('analytical');
  const [personaTone, setPersonaTone] = useState('crisp');
  const [methodFrameworks, setMethodFrameworks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!expertId.trim() || !name.trim()) {
      setError('expert_id 和 name 必填');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        expert_id: expertId.trim(),
        name: name.trim(),
        domain: domain.split(',').map((s) => s.trim()).filter(Boolean),
        persona: {
          style: personaStyle,
          tone: personaTone,
        },
        method: {
          frameworks: methodFrameworks.split(',').map((s) => s.trim()).filter(Boolean),
        },
      };
      const res = await fetch('/api/v1/expert-library/experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `创建失败 (status ${res.status})`);
        return;
      }
      onCreated?.(expertId.trim());
      // reset
      setExpertId('');
      setName('');
      setDomain('');
      setMethodFrameworks('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9000,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: '#1A1410',
          color: '#F0E8D6',
          border: '1px solid #D4A84B',
          borderRadius: 6,
          padding: '22px 24px',
          fontFamily: 'var(--sans)',
          zIndex: 9001,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: '#D4A84B',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            + 新建专家
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(212,168,75,0.3)',
              color: 'rgba(240,232,214,0.7)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>

        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 20,
            fontWeight: 600,
            margin: '0 0 18px',
          }}
        >
          注册一个新专家库角色
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="expert_id (slug, 必填)">
            <input
              value={expertId}
              onChange={(e) => setExpertId(e.target.value)}
              placeholder="e.g. ceo_advisor_alpha"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="name (必填)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 战略副官 Alpha"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="domain (逗号分隔, 可空)">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. E07.LLM, E03.Strategy"
              style={INPUT_STYLE}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="persona.style">
              <select
                value={personaStyle}
                onChange={(e) => setPersonaStyle(e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="analytical">analytical</option>
                <option value="creative">creative</option>
                <option value="critical">critical</option>
                <option value="pragmatic">pragmatic</option>
                <option value="visionary">visionary</option>
              </select>
            </Field>
            <Field label="persona.tone">
              <select
                value={personaTone}
                onChange={(e) => setPersonaTone(e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="crisp">crisp</option>
                <option value="warm">warm</option>
                <option value="incisive">incisive</option>
                <option value="empathetic">empathetic</option>
              </select>
            </Field>
          </div>
          <Field label="method.frameworks (逗号分隔)">
            <input
              value={methodFrameworks}
              onChange={(e) => setMethodFrameworks(e.target.value)}
              placeholder="e.g. SWOT, OKR, 5Whys"
              style={INPUT_STYLE}
            />
          </Field>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: 'rgba(196,106,80,0.15)',
              border: '1px solid rgba(196,106,80,0.4)',
              borderLeft: '3px solid #C46A50',
              color: '#FFB89A',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              borderRadius: '0 4px 4px 0',
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              background: 'transparent',
              color: 'rgba(240,232,214,0.65)',
              border: '1px solid rgba(240,232,214,0.2)',
              borderRadius: 4,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || !expertId.trim() || !name.trim()}
            style={{
              padding: '7px 16px',
              background: !busy && expertId.trim() && name.trim() ? '#D4A84B' : 'rgba(212,168,75,0.2)',
              color: !busy && expertId.trim() && name.trim() ? '#1A1410' : 'rgba(240,232,214,0.5)',
              border: 0,
              borderRadius: 4,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              cursor: busy ? 'wait' : !expertId.trim() || !name.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            {busy ? '创建中…' : '✓ 创建'}
          </button>
        </div>
      </div>
    </>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'rgba(0,0,0,0.3)',
  color: '#F0E8D6',
  border: '1px solid rgba(212,168,75,0.25)',
  borderRadius: 4,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          color: 'rgba(240,232,214,0.55)',
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
