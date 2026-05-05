import { useEffect, useMemo, useState, type FormEvent, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../api/client';
import '../prototype/meeting/_tokens.css';
import '../prototype/ceo/_tokens.css';

// ───────────────────────────────────────────────────────────────
// 应用入口表 — 下拉项 → 着陆路径 + 主题
// ───────────────────────────────────────────────────────────────
type ThemeId = 'meeting' | 'ceo';

interface AppEntry {
  id: string;
  label: string;
  sub: string;
  path: string;
  theme: ThemeId;
  glyph: string;
}

const APPS: AppEntry[] = [
  { id: 'meeting',   label: '会议纪要',   sub: 'Minutes · 三轴视图', path: '/meeting/today',          theme: 'meeting', glyph: 'M' },
  { id: 'ceo',       label: 'CEO 应用',   sub: '六棱镜 · 内部世界',  path: '/ceo/internal/ceo',     theme: 'ceo',     glyph: 'C' },
  { id: 'library',   label: '内容库',     sub: '事实 · 实体 · 知识', path: '/content-library',       theme: 'meeting', glyph: 'L' },
  { id: 'pipeline',  label: '任务流水线', sub: 'Dashboard',          path: '/',                       theme: 'meeting', glyph: 'P' },
];

const DEFAULT_APP_ID = 'meeting';

// ───────────────────────────────────────────────────────────────
// 主题 token 解析（避开 var(--…) 因为不在对应 className 容器下）
// ───────────────────────────────────────────────────────────────
interface ThemeTokens {
  pageBg: string;
  pageGradient: string;
  paper: string;          // 卡片背景
  paper2: string;         // input/hover 背景
  ink: string;            // 主字色
  ink2: string;
  ink3: string;
  ink4: string;
  line: string;
  line2: string;
  accent: string;
  accentSoft: string;
  accentInk: string;      // 按钮上的字色
  monoLabel: string;      // mono 小标签 (§01 / 邮箱 / 密码) 颜色
  serif: string;
  sans: string;
  mono: string;
  cardShadow: string;
  buttonShadow: string;
  logoBg: string;
  logoFg: string;
  logoFontFamily: string;
  logoFontStyle: 'normal' | 'italic';
  logoBorder?: string;
  logoRadius: number;
  cardRadius: number;
  titleItalic: boolean;   // 标题是否斜体
  errorBg: string;
  errorFg: string;
  errorBorder: string;
  errorBar: string;
  metaTopRight: string;   // 顶部右侧 meta 文本
  // moonlight / cinematic glow（仅 ceo dark 用，meeting 留空）
  moonlight?: string;
}

const SANS = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Noto Sans SC", sans-serif';
const SERIF = '"Source Serif 4", "Noto Serif SC", Georgia, serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

const THEMES: Record<ThemeId, ThemeTokens> = {
  meeting: {
    pageBg: '#f0eee9',
    pageGradient: `
      radial-gradient(ellipse at 18% 12%, oklch(0.92 0.04 40 / 0.35) 0%, transparent 45%),
      radial-gradient(ellipse at 82% 88%, oklch(0.93 0.03 200 / 0.35) 0%, transparent 45%)
    `,
    paper: 'oklch(0.985 0.006 75)',
    paper2: 'oklch(0.965 0.008 75)',
    ink: 'oklch(0.22 0.01 60)',
    ink2: 'oklch(0.38 0.01 60)',
    ink3: 'oklch(0.55 0.01 60)',
    ink4: 'oklch(0.72 0.01 60)',
    line: 'oklch(0.88 0.01 75)',
    line2: 'oklch(0.92 0.008 75)',
    accent: 'oklch(0.58 0.13 40)',
    accentSoft: 'oklch(0.92 0.04 40)',
    accentInk: 'oklch(0.985 0.006 75)',
    monoLabel: 'oklch(0.55 0.01 60)',
    serif: SERIF,
    sans: SANS,
    mono: MONO,
    cardShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px -28px rgba(40,28,18,0.18), 0 4px 14px -6px rgba(40,28,18,0.08)',
    buttonShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 1px 2px rgba(80,40,20,0.18)',
    logoBg: 'oklch(0.22 0.01 60)',
    logoFg: 'oklch(0.985 0.006 75)',
    logoFontFamily: SERIF,
    logoFontStyle: 'italic',
    logoRadius: 8,
    cardRadius: 8,
    titleItalic: false,
    errorBg: 'oklch(0.96 0.025 25)',
    errorFg: 'oklch(0.42 0.13 25)',
    errorBorder: 'oklch(0.88 0.05 25)',
    errorBar: 'oklch(0.55 0.15 25)',
    metaTopRight: 'v2.0',
  },
  // CEO 内部世界 — 暗色 / 月光 / 金色棱镜
  // 来源: prototype/ceo/_tokens.css .ceo-proto-internal + CEOHomePane "欢迎回来" 头部
  ceo: {
    pageBg: '#0F0E15',
    pageGradient: `
      radial-gradient(ellipse 600px 400px at 14% 10%, rgba(217,184,142,0.14) 0%, transparent 65%),
      radial-gradient(ellipse 800px 500px at 86% 88%, rgba(70,40,90,0.18) 0%, transparent 70%),
      radial-gradient(ellipse at 50% 100%, rgba(217,184,142,0.05) 0%, transparent 60%)
    `,
    paper: '#15121C',
    paper2: '#1A1420',
    ink: '#F3ECDD',
    ink2: '#E8E3D8',
    ink3: 'rgba(232,227,216,0.65)',
    ink4: 'rgba(232,227,216,0.42)',
    line: 'rgba(217,184,142,0.18)',
    line2: 'rgba(217,184,142,0.10)',
    accent: '#D9B88E',
    accentSoft: 'rgba(217,184,142,0.14)',
    accentInk: '#1F1B16',
    monoLabel: '#D9B88E',
    serif: SERIF,
    sans: SANS,
    mono: MONO,
    cardShadow: '0 1px 0 rgba(217,184,142,0.10) inset, 0 40px 90px -30px rgba(0,0,0,0.7), 0 12px 30px -10px rgba(0,0,0,0.45), 0 0 0 1px rgba(217,184,142,0.04)',
    buttonShadow: '0 1px 0 rgba(255,240,210,0.30) inset, 0 6px 18px -6px rgba(217,184,142,0.40), 0 0 0 1px rgba(217,184,142,0.20)',
    logoBg: 'rgba(217,184,142,0.10)',
    logoFg: '#D9B88E',
    logoFontFamily: SERIF,
    logoFontStyle: 'italic',
    logoBorder: '1px solid rgba(217,184,142,0.25)',
    logoRadius: 10,
    cardRadius: 10,
    titleItalic: true,
    errorBg: 'rgba(214,69,69,0.10)',
    errorFg: '#F0B4A8',
    errorBorder: 'rgba(214,69,69,0.30)',
    errorBar: '#D64545',
    metaTopRight: 'world · internal',
    moonlight: 'radial-gradient(circle, rgba(217,184,142,0.30), transparent 70%)',
  },
};

// ───────────────────────────────────────────────────────────────
// Login
// ───────────────────────────────────────────────────────────────
export function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [appId, setAppId] = useState<string>(DEFAULT_APP_ID);
  const [appMenuOpen, setAppMenuOpen] = useState(false);

  const selectedApp = useMemo(
    () => APPS.find((a) => a.id === appId) ?? APPS[0],
    [appId]
  );
  const t = THEMES[selectedApp.theme];

  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    authClient.get('/auth/oauth/status')
      .then((res: any) => setGoogleEnabled(!!res?.google?.enabled))
      .catch(() => setGoogleEnabled(false));
  }, []);

  useEffect(() => {
    if (!loading && user) {
      const dest = next ? decodeURIComponent(next) : selectedApp.path;
      navigate(dest, { replace: true });
    }
  }, [loading, user, next, navigate, selectedApp.path]);

  // 关菜单：点空白
  useEffect(() => {
    if (!appMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-app-menu]')) setAppMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [appMenuOpen]);

  if (!loading && user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, { rememberMe });
      const dest = next ? decodeURIComponent(next) : selectedApp.path;
      navigate(dest, { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Login failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
      background: t.pageBg,
      fontFamily: t.sans,
      color: t.ink,
      transition: 'background 400ms ease, color 400ms ease',
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: t.pageGradient,
        transition: 'opacity 400ms ease',
      }} />

      {/* 月光（仅 ceo 暗色主题） */}
      {t.moonlight && (
        <div aria-hidden style={{
          position: 'absolute',
          top: 56, right: 64,
          width: 140, height: 140,
          borderRadius: '50%',
          background: t.moonlight,
          filter: 'blur(6px)',
          pointerEvents: 'none',
        }} />
      )}

      <div style={{
        width: '100%',
        maxWidth: 440,
        position: 'relative',
        background: t.paper,
        border: `1px solid ${t.line2}`,
        borderRadius: t.cardRadius,
        padding: '36px 40px 32px',
        boxShadow: t.cardShadow,
        transition: 'background 300ms ease, border-color 300ms ease, box-shadow 300ms ease, border-radius 300ms ease',
      }}>
        {/* 顶部 mono 标记 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 28,
        }}>
          <span style={monoMeta(t, t.ink4)}>/auth/login</span>
          <span style={monoMeta(t, selectedApp.theme === 'ceo' ? t.accent : t.ink4)}>
            {t.metaTopRight}
          </span>
        </div>

        {/* Logo + 标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: t.logoRadius,
            background: t.logoBg, color: t.logoFg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: t.logoFontFamily, fontStyle: t.logoFontStyle,
            fontWeight: 500, fontSize: 24,
            flexShrink: 0,
            border: t.logoBorder ?? 'none',
            boxShadow: selectedApp.theme === 'ceo'
              ? '0 0 24px -4px rgba(217,184,142,0.30), 0 0 0 1px rgba(217,184,142,0.10) inset'
              : 'none',
            transition: 'background 300ms ease, border-radius 300ms ease',
          }}>{selectedApp.glyph}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              margin: 0,
              fontFamily: t.serif, fontWeight: 500, fontSize: 28,
              fontStyle: t.titleItalic ? 'italic' : 'normal',
              letterSpacing: '-0.015em', color: t.ink,
              lineHeight: 1.1,
            }}>
              {selectedApp.label}
            </h1>
            <div style={{ ...monoMeta(t, t.ink3), marginTop: 2 }}>
              {selectedApp.sub}
            </div>
          </div>
        </div>

        {/* 分割 */}
        <div style={{ height: 1, background: t.line2, margin: '24px 0 22px' }} />

        <div style={{ ...sectionLabel(t), marginBottom: 16 }}>
          <span style={{ color: t.ink4 }}>§01</span>{' '}登录到您的工作区
        </div>

        <form onSubmit={onSubmit}>
          <label style={labelStyle(t)}>邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setEmailFocus(true)}
            onBlur={() => setEmailFocus(false)}
            placeholder="xx@abc.com"
            required
            autoFocus
            disabled={submitting}
            style={inputStyle(t, emailFocus)}
          />

          <label style={{ ...labelStyle(t), marginTop: 18 }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocus(true)}
            onBlur={() => setPasswordFocus(false)}
            placeholder="••••••••"
            required
            disabled={submitting}
            style={inputStyle(t, passwordFocus)}
          />

          {/* 应用入口下拉 */}
          <label style={{ ...labelStyle(t), marginTop: 18 }}>登录后前往</label>
          <AppSelect
            t={t}
            apps={APPS}
            selected={selectedApp}
            open={appMenuOpen}
            onToggle={() => setAppMenuOpen((v) => !v)}
            onPick={(id) => { setAppId(id); setAppMenuOpen(false); }}
            disabled={submitting}
          />

          {/* 记住登录 + hint */}
          <div style={{
            marginTop: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12,
          }}>
            <Checkbox
              t={t}
              checked={rememberMe}
              onChange={setRememberMe}
              disabled={submitting}
              label="30 天免登录"
            />
            <span style={{
              fontFamily: t.mono, fontSize: 10, letterSpacing: 0.2,
              color: t.ink4,
            }}>
              {rememberMe ? '30 d · persistent' : '1 d · session'}
            </span>
          </div>

          {error && (
            <div style={{
              marginTop: 14,
              padding: '10px 12px',
              background: t.errorBg,
              color: t.errorFg,
              border: `1px solid ${t.errorBorder}`,
              borderLeft: `2px solid ${t.errorBar}`,
              borderRadius: 4,
              fontSize: 12.5,
              fontFamily: t.sans,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span style={{
                fontFamily: t.mono, fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: t.errorBar,
                flexShrink: 0, marginTop: 1,
              }}>err</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 24,
              width: '100%',
              padding: '11px 16px',
              background: submitting ? mix(t.accent, t.paper2, 0.55) : t.accent,
              color: t.accentInk,
              border: `1px solid ${submitting ? mix(t.accent, t.paper2, 0.55) : t.accent}`,
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: t.sans,
              letterSpacing: 0.2,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, transform 0.05s',
              boxShadow: submitting ? 'none' : t.buttonShadow,
            }}
            onMouseDown={(e) => !submitting && ((e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)')}
            onMouseUp={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)')}
          >
            {submitting ? '登录中…' : `登录 → ${selectedApp.label}`}
          </button>
        </form>

        {/* OAuth 区 */}
        <div style={{
          marginTop: 26,
          paddingTop: 20,
          borderTop: `1px solid ${t.line2}`,
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
            background: t.paper, padding: '0 10px',
            fontFamily: t.mono, fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: t.ink4,
          }}>
            或
          </div>

          {googleEnabled ? (
            <a
              href={`/api/auth/oauth/google/start?next=${encodeURIComponent(next || selectedApp.path)}`}
              style={{
                padding: '10px 16px',
                background: t.paper,
                color: t.ink2,
                border: `1px solid ${t.line}`,
                borderRadius: 6,
                fontSize: 13.5,
                fontWeight: 500,
                fontFamily: t.sans,
                cursor: 'pointer',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = t.paper2;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = t.ink4;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = t.paper;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = t.line;
              }}
            >
              <GoogleGlyph />
              使用 Google 登录
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="后端未配置 GOOGLE_OAUTH_CLIENT_ID / SECRET; admin 配置后自动启用"
              style={{
                width: '100%',
                padding: '10px 16px',
                background: t.paper2,
                color: t.ink4,
                border: `1px dashed ${t.line}`,
                borderRadius: 6,
                fontSize: 12.5,
                fontFamily: t.sans,
                cursor: 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span style={{
                fontFamily: t.mono, fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: t.ink4,
              }}>oauth</span>
              使用 Google 登录（未配置）
            </button>
          )}
        </div>

        {/* 底部 mono footer */}
        <div style={{
          marginTop: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: t.mono, fontSize: 10, letterSpacing: '0.1em',
          color: t.ink4,
        }}>
          <span>scubiry · pipeline</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: 99,
              background: 'oklch(0.7 0.13 145)',
              boxShadow: '0 0 0 3px oklch(0.7 0.13 145 / 0.15)',
            }} />
            ready
          </span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// 子组件
// ───────────────────────────────────────────────────────────────

function AppSelect({
  t, apps, selected, open, onToggle, onPick, disabled,
}: {
  t: ThemeTokens;
  apps: AppEntry[];
  selected: AppEntry;
  open: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div data-app-menu style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 12px',
          paddingRight: 36,
          border: `1px solid ${open ? t.accent : t.line}`,
          borderRadius: 5,
          background: t.paper,
          color: t.ink,
          fontFamily: t.sans, fontSize: 14,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          outline: 'none',
          boxShadow: open ? `0 0 0 3px ${t.accentSoft}` : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          position: 'relative',
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: t.logoRadius / 2,
          background: t.logoBg, color: t.logoFg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: t.logoFontFamily, fontStyle: t.logoFontStyle,
          fontWeight: 500, fontSize: 13,
          flexShrink: 0,
        }}>{selected.glyph}</span>
        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <span style={{ fontWeight: 500 }}>{selected.label}</span>
          <span style={{
            display: 'block', marginTop: 2,
            fontFamily: t.mono, fontSize: 10, letterSpacing: 0.2, color: t.ink4,
          }}>
            {selected.sub}
          </span>
        </span>
        <ChevronGlyph color={t.ink3} flipped={open} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
          background: t.paper,
          border: `1px solid ${t.line}`,
          borderRadius: 6,
          boxShadow: '0 12px 32px -10px rgba(0,0,0,0.18), 0 4px 10px -4px rgba(0,0,0,0.08)',
          padding: 4,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {apps.map((a) => {
            const active = a.id === selected.id;
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => onPick(a.id)}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = t.paper2;
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 4,
                  border: 0, cursor: 'pointer',
                  background: active ? t.accentSoft : 'transparent',
                  color: t.ink,
                  fontFamily: t.sans, fontSize: 13.5,
                  textAlign: 'left',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: t.paper2,
                  color: t.ink,
                  border: `1px solid ${t.line}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: SERIF,
                  fontStyle: a.theme === 'ceo' ? 'italic' : 'italic',
                  fontWeight: 500, fontSize: 12,
                  flexShrink: 0,
                }}>{a.glyph}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: active ? 600 : 500 }}>{a.label}</span>
                  <span style={{
                    display: 'block', marginTop: 1,
                    fontFamily: t.mono, fontSize: 10, color: t.ink4, letterSpacing: 0.2,
                  }}>
                    {a.path}
                  </span>
                </span>
                {/* 主题徽标 */}
                <span style={{
                  fontFamily: t.mono, fontSize: 9, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: t.ink4,
                  border: `1px solid ${t.line}`, borderRadius: 99,
                  padding: '1px 6px',
                }}>
                  {a.theme}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Checkbox({
  t, checked, onChange, disabled, label,
}: {
  t: ThemeTokens;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      userSelect: 'none',
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4,
        border: `1px solid ${checked ? t.accent : t.line}`,
        background: checked ? t.accent : t.paper,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s, border-color 0.15s',
        flexShrink: 0,
      }}>
        {checked && (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
            stroke={t.accentInk} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
      <span style={{
        fontSize: 13, fontFamily: t.sans, color: t.ink2,
      }}>
        {label}
      </span>
    </label>
  );
}

function ChevronGlyph({ color, flipped }: { color: string; flipped?: boolean }) {
  return (
    <span style={{
      position: 'absolute', right: 12, top: '50%',
      transform: `translateY(-50%) rotate(${flipped ? 180 : 0}deg)`,
      transition: 'transform 0.18s ease',
      color, display: 'inline-flex',
    }}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

function GoogleGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A8.99 8.99 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.97 8.97 0 0 0 9 0 8.99 8.99 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────

function labelStyle(t: ThemeTokens): CSSProperties {
  return {
    display: 'block',
    fontFamily: t.mono,
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: t.monoLabel,
    marginBottom: 7,
  };
}

function inputStyle(t: ThemeTokens, focused: boolean): CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${focused ? t.accent : t.line}`,
    borderRadius: 5,
    fontSize: 14,
    fontFamily: t.sans,
    color: t.ink,
    background: t.paper,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxShadow: focused ? `0 0 0 3px ${t.accentSoft}` : 'none',
  };
}

function monoMeta(t: ThemeTokens, color: string): CSSProperties {
  return {
    fontFamily: t.mono, fontSize: 10.5, letterSpacing: '0.14em',
    textTransform: 'uppercase', color,
  };
}

function sectionLabel(t: ThemeTokens): CSSProperties {
  return {
    fontFamily: t.mono, fontSize: 10.5, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: t.monoLabel,
  };
}

// 简易颜色混合：fg 与 bg 混合 (ratio: 0=纯 bg, 1=纯 fg)
// 仅对 disabled button 提供柔化色
function mix(a: string, b: string, ratio: number): string {
  // 不解析 oklch/hex，简单 fallback：用 color-mix（现代浏览器全支持）
  return `color-mix(in oklch, ${a} ${Math.round(ratio * 100)}%, ${b})`;
}
