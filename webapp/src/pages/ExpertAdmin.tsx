// Expert Admin — 专家详情页（调试/校准台）
// 设计系统: Architectural Authority — Champagne Silk × Industrial Steel
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './ExpertAdmin.css';

const API = '/api/v1/expert-library';

// ─── types ───────────────────────────────────────────────────────────────────
interface ExpertProfile {
  expert_id: string;
  name: string;
  domain: string[];
  persona: {
    style: string; tone: string; bias?: string[];
    cognition?: { mentalModel: string; decisionStyle: string; riskAttitude: string; timeHorizon: string };
    values?: { excites: string[]; irritates: string[]; qualityBar: string; dealbreakers: string[] };
    taste?: { admires: string[]; disdains: string[]; benchmark: string };
    voice?: { disagreementStyle: string; praiseStyle: string };
    blindSpots?: { knownBias: string[]; weakDomains: string[]; selfAwareness: string };
  };
  method: {
    frameworks: string[]; reasoning: string; analysis_steps: string[];
    reviewLens?: { firstGlance: string; deepDive: string[]; killShot: string; bonusPoints: string[] };
    dataPreference?: string; evidenceStandard?: string;
  };
  emm?: {
    critical_factors: string[];
    factor_hierarchy: Record<string, number>;
    veto_rules: string[];
    aggregation_logic: string;
  };
  constraints: { must_conclude: boolean; allow_assumption: boolean };
  output_schema: { format: string; sections: string[] };
  anti_patterns: string[];
  signature_phrases: string[];
}

interface KnowledgeSource { id: string; source_type: string; title: string; summary: string; created_at: string }
interface Performance { total_invocations: number; average_confidence: string; average_human_score: string; feedback_count: number; emm_pass_rate: string; calibration_status: string }

const NAV_ITEMS = [
  { id: 'persona',     icon: 'psychology',       label: 'PERSONA' },
  { id: 'methodology', icon: 'architecture',      label: 'METHODOLOGY' },
  { id: 'emm',         icon: 'gavel',             label: 'EMM GATE' },
  { id: 'calibrate',   icon: 'science',           label: 'CALIBRATE' },
  { id: 'materials',   icon: 'library_books',     label: 'MATERIALS' },
  { id: 'signature',   icon: 'draw',              label: 'SIGNATURE' },
];

export function ExpertAdmin() {
  const { expertId } = useParams<{ expertId: string }>();
  const navigate = useNavigate();

  const [expert, setExpert]               = useState<ExpertProfile | null>(null);
  const [perf, setPerf]                   = useState<Performance | null>(null);
  const [knowledge, setKnowledge]         = useState<KnowledgeSource[]>([]);
  const [activeSection, setActiveSection] = useState('persona');
  const [loading, setLoading]             = useState(true);

  // Calibrate test
  const [testInput, setTestInput]     = useState('');
  const [testType, setTestType]       = useState<'analysis'|'evaluation'|'generation'>('analysis');
  const [testResult, setTestResult]   = useState<any>(null);
  const [isRunning, setIsRunning]     = useState(false);

  // Materials add
  const [showAddMaterial, setShowAddMaterial]   = useState(false);
  const [matTitle, setMatTitle]                 = useState('');
  const [matContent, setMatContent]             = useState('');
  const [matType, setMatType]                   = useState('publication');
  const [matSaving, setMatSaving]               = useState(false);

  // Signature edit
  const [editingSig, setEditingSig]       = useState(false);
  const [signatures, setSignatures]       = useState<string[]>([]);
  const [antiPatterns, setAntiPatterns]   = useState<string[]>([]);
  const [newSig, setNewSig]               = useState('');
  const [newAnti, setNewAnti]             = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState('');

  // Feedback
  const [fbScore, setFbScore]   = useState(3);
  const [fbNotes, setFbNotes]   = useState('');
  const [fbSent, setFbSent]     = useState(false);

  // Section refs for scrollspy
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!expertId) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/experts/${expertId}`).then(r => r.json()),
      fetch(`${API}/experts/${expertId}/performance`).then(r => r.json()).catch(() => null),
      fetch(`${API}/experts/${expertId}/knowledge`).then(r => r.json()).catch(() => ({ sources: [] })),
    ]).then(([exp, p, k]) => {
      setExpert(exp);
      setSignatures(exp.signature_phrases || []);
      setAntiPatterns(exp.anti_patterns || []);
      setPerf(p);
      setKnowledge(k.sources || []);
    }).finally(() => setLoading(false));
  }, [expertId]);

  // ── Scrollspy ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
    }, { threshold: 0.2 });
    Object.values(sectionRefs.current).forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, [expert]);

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Calibrate test ─────────────────────────────────────────────────────────
  const runTest = useCallback(async () => {
    if (!testInput.trim() || !expertId || isRunning) return;
    setIsRunning(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expert_id: expertId, task_type: testType, input_type: 'text', input_data: testInput }),
      });
      setTestResult(await r.json());
    } catch (e: any) {
      setTestResult({ error: e.message });
    } finally {
      setIsRunning(false);
    }
  }, [testInput, testType, expertId, isRunning]);

  // ── Materials ──────────────────────────────────────────────────────────────
  const addMaterial = async () => {
    if (!matTitle.trim() || !matContent.trim() || !expertId) return;
    setMatSaving(true);
    try {
      const r = await fetch(`${API}/experts/${expertId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: matType, title: matTitle, content: matContent }),
      });
      const data = await r.json();
      setKnowledge(prev => [{ id: data.id, source_type: matType, title: matTitle, summary: data.summary || '', created_at: new Date().toISOString() }, ...prev]);
      setMatTitle(''); setMatContent(''); setShowAddMaterial(false);
    } finally {
      setMatSaving(false);
    }
  };

  const deleteMaterial = async (sid: string) => {
    await fetch(`${API}/experts/${expertId}/knowledge/${sid}`, { method: 'DELETE' });
    setKnowledge(prev => prev.filter(k => k.id !== sid));
  };

  // ── Signature save ─────────────────────────────────────────────────────────
  const saveSignature = async () => {
    if (!expertId) return;
    setSaving(true);
    try {
      await fetch(`${API}/experts/${expertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_phrases: signatures, anti_patterns: antiPatterns }),
      });
      setSaveMsg('已保存（会话级，重启重置）');
      setEditingSig(false);
      setTimeout(() => setSaveMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ── Feedback submit ────────────────────────────────────────────────────────
  const submitFeedback = async () => {
    if (!expertId) return;
    await fetch(`${API}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expert_id: expertId, invoke_id: '00000000-0000-0000-0000-000000000000', human_score: fbScore, human_notes: fbNotes }),
    });
    setFbSent(true);
    setFbNotes('');
    setTimeout(() => setFbSent(false), 3000);
  };

  // ── Export JSON ────────────────────────────────────────────────────────────
  const exportJSON = () => {
    if (!expert) return;
    const blob = new Blob([JSON.stringify(expert, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${expert.expert_id}-profile.json`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="ea-loading">
      <div className="ea-loading-bar" />
      <span>LOADING EXPERT PROFILE...</span>
    </div>
  );

  if (!expert) return (
    <div className="ea-error">
      <span className="material-symbols-outlined">error_outline</span>
      <p>Expert not found: {expertId}</p>
      <button onClick={() => navigate('/expert-library')}>← 返回专家库</button>
    </div>
  );

  const maxWeight = expert.emm ? Math.max(...Object.values(expert.emm.factor_hierarchy)) : 1;

  return (
    <div className="ea-root">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="ea-topbar">
        <div className="ea-topbar-left">
          <span className="ea-logo">EXPERT TUNING ENGINE</span>
          <nav className="ea-breadcrumb">
            <button onClick={() => navigate('/expert-library')} className="ea-bc-link">EXPERT PROFILES</button>
            <span className="ea-bc-sep">/</span>
            <span className="ea-bc-current">{expert.expert_id}</span>
          </nav>
        </div>
        <div className="ea-topbar-right">
          <span className="ea-status-dot" />
          <span className="ea-status-label">PROFILE ACTIVE</span>
        </div>
      </header>

      <div className="ea-body">
        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <aside className="ea-sidebar">
          <div className="ea-sidebar-identity">
            <div className="ea-ident-avatar">{expert.name.charAt(0)}</div>
            <div>
              <div className="ea-ident-name">{expert.name}</div>
              <div className="ea-ident-id">{expert.expert_id}</div>
            </div>
          </div>
          <div className="ea-ident-domains">
            {expert.domain.slice(0, 3).map(d => <span key={d} className="ea-domain-chip">{d}</span>)}
          </div>

          <nav className="ea-sidenav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`ea-navitem ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => scrollTo(item.id)}
              >
                <span className="material-symbols-outlined ea-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'materials' && knowledge.length > 0 &&
                  <span className="ea-nav-badge">{knowledge.length}</span>}
                {item.id === 'calibrate' && perf && perf.total_invocations > 0 &&
                  <span className="ea-nav-badge">{perf.total_invocations}</span>}
              </button>
            ))}
          </nav>

          <div className="ea-sidebar-footer">
            <div className="ea-perf-row">
              <span className="ea-perf-label">调用次数</span>
              <span className="ea-perf-val">{perf?.total_invocations ?? '—'}</span>
            </div>
            <div className="ea-perf-row">
              <span className="ea-perf-label">EMM通过率</span>
              <span className="ea-perf-val">{perf?.emm_pass_rate ?? '—'}</span>
            </div>
            <div className="ea-perf-row">
              <span className="ea-perf-label">校准状态</span>
              <span className={`ea-calib-status ${perf?.calibration_status === 'Optimal' ? 'optimal' : ''}`}>
                {perf?.calibration_status ?? 'No data'}
              </span>
            </div>
          </div>
        </aside>

        {/* ── Main scroll area ──────────────────────────────────────────── */}
        <main className="ea-main">
          {/* Expert header */}
          <div className="ea-hero">
            <div>
              <p className="ea-hero-id">CONFIGURATION NODE: {expert.expert_id}</p>
              <h1 className="ea-hero-name">{expert.name}</h1>
              <p className="ea-hero-style">{expert.persona.style}</p>
            </div>
            <div className="ea-constraints-row">
              <div className={`ea-constraint-chip ${expert.constraints.must_conclude ? 'on' : 'off'}`}>
                MUST CONCLUDE {expert.constraints.must_conclude ? '✓' : '✗'}
              </div>
              <div className={`ea-constraint-chip ${expert.constraints.allow_assumption ? 'on' : 'off'}`}>
                ALLOW ASSUMPTIONS {expert.constraints.allow_assumption ? '✓' : '✗'}
              </div>
            </div>
          </div>

          {/* ═══ PERSONA ═══════════════════════════════════════════════════ */}
          <section id="persona" ref={el => { sectionRefs.current['persona'] = el; }} className="ea-section">
            <div className="ea-section-header">
              <span className="material-symbols-outlined ea-section-icon">psychology</span>
              <h2 className="ea-section-title">COGNITIVE PERSONA</h2>
            </div>

            {expert.persona.cognition && (
              <div className="ea-grid-4 ea-mb">
                {[
                  { label: 'MENTAL MODEL',    val: expert.persona.cognition.mentalModel },
                  { label: 'DECISION STYLE',  val: expert.persona.cognition.decisionStyle },
                  { label: 'RISK ATTITUDE',   val: expert.persona.cognition.riskAttitude },
                  { label: 'TIME HORIZON',    val: expert.persona.cognition.timeHorizon },
                ].map(({ label, val }) => (
                  <div key={label} className="ea-cog-card">
                    <span className="ea-field-label">{label}</span>
                    <p className="ea-field-val">{val}</p>
                  </div>
                ))}
              </div>
            )}

            {expert.persona.values && (
              <div className="ea-grid-4 ea-mb">
                <div className="ea-val-card excites">
                  <div className="ea-val-header">EXCITES</div>
                  {expert.persona.values.excites.map(v => <span key={v} className="ea-tag positive">{v}</span>)}
                </div>
                <div className="ea-val-card irritates">
                  <div className="ea-val-header">IRRITATES</div>
                  {expert.persona.values.irritates.map(v => <span key={v} className="ea-tag negative">{v}</span>)}
                </div>
                <div className="ea-val-card quality">
                  <div className="ea-val-header">QUALITY BAR</div>
                  <p className="ea-field-val sm">{expert.persona.values.qualityBar}</p>
                </div>
                <div className="ea-val-card deal">
                  <div className="ea-val-header">DEALBREAKERS</div>
                  {expert.persona.values.dealbreakers.map(v => <span key={v} className="ea-tag deal">{v}</span>)}
                </div>
              </div>
            )}

            {(expert.persona.voice || expert.persona.blindSpots) && (
              <div className="ea-grid-2">
                {expert.persona.voice && (
                  <div className="ea-card">
                    <span className="ea-field-label">DISAGREEMENT STYLE</span>
                    <p className="ea-field-val sm ea-mb-sm">{expert.persona.voice.disagreementStyle}</p>
                    <span className="ea-field-label">PRAISE STYLE</span>
                    <p className="ea-field-val sm">{expert.persona.voice.praiseStyle}</p>
                  </div>
                )}
                {expert.persona.blindSpots && (
                  <div className="ea-card">
                    <span className="ea-field-label">KNOWN BIASES</span>
                    <div className="ea-tag-row ea-mb-sm">
                      {expert.persona.blindSpots.knownBias.map(b => <span key={b} className="ea-tag warn">{b}</span>)}
                    </div>
                    <span className="ea-field-label">WEAK DOMAINS</span>
                    <div className="ea-tag-row ea-mb-sm">
                      {expert.persona.blindSpots.weakDomains.map(d => <span key={d} className="ea-tag neutral">{d}</span>)}
                    </div>
                    <span className="ea-field-label">SELF-AWARENESS</span>
                    <p className="ea-field-val sm italic">{expert.persona.blindSpots.selfAwareness}</p>
                  </div>
                )}
              </div>
            )}

            {expert.persona.taste && (
              <div className="ea-card ea-mt">
                <div className="ea-grid-3">
                  <div>
                    <span className="ea-field-label">ADMIRES</span>
                    {expert.persona.taste.admires.map(a => <p key={a} className="ea-taste-item admires">↑ {a}</p>)}
                  </div>
                  <div>
                    <span className="ea-field-label">DISDAINS</span>
                    {expert.persona.taste.disdains.map(d => <p key={d} className="ea-taste-item disdains">↓ {d}</p>)}
                  </div>
                  <div>
                    <span className="ea-field-label">BENCHMARK</span>
                    <p className="ea-field-val sm">{expert.persona.taste.benchmark}</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ═══ METHODOLOGY ════════════════════════════════════════════════ */}
          <section id="methodology" ref={el => { sectionRefs.current['methodology'] = el; }} className="ea-section">
            <div className="ea-section-header">
              <span className="material-symbols-outlined ea-section-icon">architecture</span>
              <h2 className="ea-section-title">METHODOLOGY</h2>
            </div>

            <div className="ea-grid-2">
              <div>
                <span className="ea-field-label">ANALYTICAL FRAMEWORKS</span>
                <div className="ea-frameworks ea-mb">
                  {expert.method.frameworks.map((f, i) => (
                    <div key={f} className="ea-framework-item">
                      <span className="ea-framework-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="ea-framework-name">{f}</span>
                    </div>
                  ))}
                </div>
                <span className="ea-field-label">REASONING TYPE</span>
                <p className="ea-field-val sm">{expert.method.reasoning}</p>
              </div>
              <div>
                <span className="ea-field-label">ANALYSIS STEPS</span>
                <ol className="ea-steps">
                  {expert.method.analysis_steps.map((s, i) => (
                    <li key={i} className="ea-step-item">{s}</li>
                  ))}
                </ol>
              </div>
            </div>

            {expert.method.reviewLens && (
              <div className="ea-card ea-mt">
                <div className="ea-grid-2">
                  <div>
                    <span className="ea-field-label">FIRST GLANCE</span>
                    <p className="ea-field-val sm ea-mb">{expert.method.reviewLens.firstGlance}</p>
                    <span className="ea-field-label">KILL SHOT</span>
                    <p className="ea-field-val sm red">{expert.method.reviewLens.killShot}</p>
                  </div>
                  <div>
                    <span className="ea-field-label">DEEP DIVE</span>
                    {expert.method.reviewLens.deepDive.map(d => (
                      <p key={d} className="ea-deep-item">— {d}</p>
                    ))}
                    <span className="ea-field-label ea-mt-sm">BONUS POINTS</span>
                    {expert.method.reviewLens.bonusPoints.map(b => (
                      <p key={b} className="ea-deep-item gold">+ {b}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(expert.method.dataPreference || expert.method.evidenceStandard) && (
              <div className="ea-grid-2 ea-mt">
                {expert.method.dataPreference && (
                  <div className="ea-card">
                    <span className="ea-field-label">DATA PREFERENCE</span>
                    <p className="ea-field-val sm">{expert.method.dataPreference}</p>
                  </div>
                )}
                {expert.method.evidenceStandard && (
                  <div className="ea-card">
                    <span className="ea-field-label">EVIDENCE STANDARD</span>
                    <p className="ea-field-val sm">{expert.method.evidenceStandard}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ═══ EMM GATE (dark steel) ══════════════════════════════════════ */}
          <section id="emm" ref={el => { sectionRefs.current['emm'] = el; }} className="ea-section ea-section-steel">
            <div className="ea-section-header light">
              <span className="material-symbols-outlined ea-section-icon gold">gavel</span>
              <h2 className="ea-section-title light">EMM GATE LOGIC</h2>
              {expert.emm && (
                <span className="ea-emm-logic-tag">{expert.emm.aggregation_logic}</span>
              )}
            </div>

            {expert.emm ? (
              <div className="ea-grid-2">
                <div>
                  <span className="ea-field-label light">CRITICAL FACTOR HIERARCHY</span>
                  <div className="ea-factors">
                    {Object.entries(expert.emm.factor_hierarchy)
                      .sort(([, a], [, b]) => b - a)
                      .map(([factor, weight]) => (
                        <div key={factor} className="ea-factor-row">
                          <span className="ea-factor-name">{factor}</span>
                          <div className="ea-factor-bar-track">
                            <div
                              className="ea-factor-bar-fill"
                              style={{ width: `${(weight / maxWeight) * 100}%` }}
                            />
                          </div>
                          <span className="ea-factor-weight">{(weight * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <span className="ea-field-label light">VETO RULES — ONE-STRIKE LOGIC</span>
                  <div className="ea-veto-list">
                    {expert.emm.veto_rules.map((rule, i) => (
                      <div key={i} className="ea-veto-item">
                        <span className="ea-veto-icon">⊗</span>
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="ea-no-emm">此专家尚未配置 EMM 门控规则</p>
            )}
          </section>

          {/* ═══ CALIBRATE ══════════════════════════════════════════════════ */}
          <section id="calibrate" ref={el => { sectionRefs.current['calibrate'] = el; }} className="ea-section">
            <div className="ea-section-header">
              <span className="material-symbols-outlined ea-section-icon">science</span>
              <h2 className="ea-section-title">CALIBRATE &amp; TEST</h2>
            </div>

            <div className="ea-grid-2">
              {/* Test panel */}
              <div>
                <div className="ea-task-type-row ea-mb">
                  {(['analysis', 'evaluation', 'generation'] as const).map(t => (
                    <button
                      key={t}
                      className={`ea-type-btn ${testType === t ? 'active' : ''}`}
                      onClick={() => setTestType(t)}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <span className="ea-field-label">TEST INPUT</span>
                <textarea
                  className="ea-textarea ea-mb"
                  rows={6}
                  placeholder="输入需要用该专家分析/评估/生成的内容..."
                  value={testInput}
                  onChange={e => setTestInput(e.target.value)}
                />
                <button
                  className={`ea-run-btn ${isRunning ? 'running' : ''}`}
                  onClick={runTest}
                  disabled={isRunning || !testInput.trim()}
                >
                  {isRunning ? '◌ RUNNING...' : '▶ INVOKE EXPERT'}
                </button>
              </div>

              {/* Performance panel */}
              <div>
                <span className="ea-field-label">PERFORMANCE METRICS</span>
                {perf ? (
                  <div className="ea-perf-grid">
                    <div className="ea-perf-cell">
                      <span className="ea-perf-big">{perf.total_invocations}</span>
                      <span className="ea-perf-caption">TOTAL INVOCATIONS</span>
                    </div>
                    <div className="ea-perf-cell">
                      <span className="ea-perf-big">{perf.average_confidence}</span>
                      <span className="ea-perf-caption">AVG CONFIDENCE</span>
                    </div>
                    <div className="ea-perf-cell">
                      <span className="ea-perf-big">{perf.emm_pass_rate}</span>
                      <span className="ea-perf-caption">EMM PASS RATE</span>
                    </div>
                    <div className="ea-perf-cell">
                      <span className="ea-perf-big">{perf.average_human_score !== 'N/A' ? perf.average_human_score + '/5' : '—'}</span>
                      <span className="ea-perf-caption">HUMAN SCORE</span>
                    </div>
                  </div>
                ) : (
                  <div className="ea-no-data">暂无数据</div>
                )}

                {/* Feedback form */}
                <span className="ea-field-label ea-mt">SUBMIT FEEDBACK</span>
                <div className="ea-score-row ea-mb-sm">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      className={`ea-score-btn ${fbScore === n ? 'active' : ''}`}
                      onClick={() => setFbScore(n)}
                    >{n}</button>
                  ))}
                </div>
                <textarea
                  className="ea-textarea ea-mb-sm"
                  rows={2}
                  placeholder="反馈备注（可选）..."
                  value={fbNotes}
                  onChange={e => setFbNotes(e.target.value)}
                />
                <button className="ea-secondary-btn" onClick={submitFeedback}>
                  {fbSent ? '✓ RECEIVED' : 'SUBMIT FEEDBACK'}
                </button>
              </div>
            </div>

            {/* Test result */}
            {testResult && (
              <div className="ea-test-result">
                <div className="ea-test-result-header">
                  <span className="material-symbols-outlined">output</span>
                  <span>EXPERT OUTPUT</span>
                  {testResult.metadata && (
                    <span className="ea-result-meta">
                      confidence: {(testResult.metadata.confidence * 100).toFixed(0)}% ·
                      EMM: {testResult.metadata.emm_gates_passed?.join(', ') || '—'}
                    </span>
                  )}
                </div>
                {testResult.error ? (
                  <p className="ea-result-error">{testResult.error}</p>
                ) : (
                  <div className="ea-result-sections">
                    {testResult.output?.sections?.map((s: any, i: number) => (
                      <div key={i} className="ea-result-section">
                        <div className="ea-result-section-title">{s.title}</div>
                        <p className="ea-result-section-body">{s.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ═══ MATERIALS ══════════════════════════════════════════════════ */}
          <section id="materials" ref={el => { sectionRefs.current['materials'] = el; }} className="ea-section">
            <div className="ea-section-header">
              <span className="material-symbols-outlined ea-section-icon">library_books</span>
              <h2 className="ea-section-title">KNOWLEDGE MATERIALS</h2>
              <button className="ea-add-btn" onClick={() => setShowAddMaterial(v => !v)}>
                {showAddMaterial ? '× CANCEL' : '+ ADD SOURCE'}
              </button>
            </div>

            {showAddMaterial && (
              <div className="ea-add-form ea-mb">
                <div className="ea-grid-2 ea-mb-sm">
                  <div>
                    <span className="ea-field-label">SOURCE TYPE</span>
                    <select className="ea-select" value={matType} onChange={e => setMatType(e.target.value)}>
                      <option value="publication">文章/论文</option>
                      <option value="interview">访谈记录</option>
                      <option value="meeting_minutes">会议纪要</option>
                      <option value="conference">演讲/会议</option>
                      <option value="link">网页链接</option>
                    </select>
                  </div>
                  <div>
                    <span className="ea-field-label">TITLE</span>
                    <input
                      className="ea-input"
                      placeholder="材料标题..."
                      value={matTitle}
                      onChange={e => setMatTitle(e.target.value)}
                    />
                  </div>
                </div>
                <span className="ea-field-label">CONTENT</span>
                <textarea
                  className="ea-textarea ea-mb-sm"
                  rows={5}
                  placeholder="粘贴原文内容（LLM 将自动提取摘要和关键洞察）..."
                  value={matContent}
                  onChange={e => setMatContent(e.target.value)}
                />
                <button
                  className="ea-run-btn"
                  onClick={addMaterial}
                  disabled={matSaving || !matTitle.trim() || !matContent.trim()}
                >
                  {matSaving ? '◌ PROCESSING...' : '↑ UPLOAD & EXTRACT'}
                </button>
              </div>
            )}

            {knowledge.length === 0 ? (
              <div className="ea-no-data">暂无知识材料 — 添加访谈记录、文章、会议纪要来增强该专家的判断依据</div>
            ) : (
              <div className="ea-material-list">
                {knowledge.map(k => (
                  <div key={k.id} className="ea-material-item">
                    <div className="ea-mat-type-badge">{k.source_type.replace('_', ' ')}</div>
                    <div className="ea-mat-body">
                      <div className="ea-mat-title">{k.title}</div>
                      {k.summary && <p className="ea-mat-summary">{k.summary}</p>}
                    </div>
                    <div className="ea-mat-meta">
                      <span className="ea-mat-date">{new Date(k.created_at).toLocaleDateString('zh-CN')}</span>
                      <button className="ea-mat-delete" onClick={() => deleteMaterial(k.id)}>DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ═══ SIGNATURE ══════════════════════════════════════════════════ */}
          <section id="signature" ref={el => { sectionRefs.current['signature'] = el; }} className="ea-section">
            <div className="ea-section-header">
              <span className="material-symbols-outlined ea-section-icon">draw</span>
              <h2 className="ea-section-title">BRAND &amp; SIGNATURE</h2>
              {!editingSig ? (
                <button className="ea-add-btn" onClick={() => setEditingSig(true)}>✎ EDIT</button>
              ) : (
                <div className="ea-sig-actions">
                  <button className="ea-add-btn cancel" onClick={() => { setEditingSig(false); setSignatures(expert.signature_phrases); setAntiPatterns(expert.anti_patterns); }}>CANCEL</button>
                  <button className="ea-run-btn small" onClick={saveSignature} disabled={saving}>
                    {saving ? '...' : 'SAVE'}
                  </button>
                  {saveMsg && <span className="ea-save-msg">{saveMsg}</span>}
                </div>
              )}
            </div>

            <div className="ea-grid-2">
              {/* Signature phrases */}
              <div>
                <span className="ea-field-label">SIGNATURE PHRASES</span>
                <div className="ea-sig-list">
                  {signatures.map((p, i) => (
                    <div key={i} className="ea-sig-item">
                      <span className="ea-sig-quote">"</span>
                      <span className="ea-sig-text">{p}</span>
                      {editingSig && (
                        <button className="ea-sig-del" onClick={() => setSignatures(prev => prev.filter((_, j) => j !== i))}>×</button>
                      )}
                    </div>
                  ))}
                  {editingSig && (
                    <div className="ea-sig-add-row">
                      <input
                        className="ea-input"
                        placeholder="新增标志性表达..."
                        value={newSig}
                        onChange={e => setNewSig(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newSig.trim()) { setSignatures(prev => [...prev, newSig.trim()]); setNewSig(''); }}}
                      />
                      <button className="ea-secondary-btn" onClick={() => { if (newSig.trim()) { setSignatures(prev => [...prev, newSig.trim()]); setNewSig(''); }}}>+ ADD</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Anti-patterns */}
              <div>
                <span className="ea-field-label">ANTI-PATTERNS (FORBIDDEN)</span>
                <div className="ea-anti-list">
                  {antiPatterns.map((p, i) => (
                    <div key={i} className="ea-anti-item">
                      <span className="ea-anti-icon">⊗</span>
                      <span className="ea-anti-text">{p}</span>
                      {editingSig && (
                        <button className="ea-sig-del" onClick={() => setAntiPatterns(prev => prev.filter((_, j) => j !== i))}>×</button>
                      )}
                    </div>
                  ))}
                  {editingSig && (
                    <div className="ea-sig-add-row">
                      <input
                        className="ea-input"
                        placeholder="新增禁止模式..."
                        value={newAnti}
                        onChange={e => setNewAnti(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newAnti.trim()) { setAntiPatterns(prev => [...prev, newAnti.trim()]); setNewAnti(''); }}}
                      />
                      <button className="ea-secondary-btn" onClick={() => { if (newAnti.trim()) { setAntiPatterns(prev => [...prev, newAnti.trim()]); setNewAnti(''); }}}>+ ADD</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Output schema */}
            <div className="ea-card ea-mt">
              <span className="ea-field-label">OUTPUT SCHEMA</span>
              <div className="ea-output-schema">
                <span className="ea-schema-format">{expert.output_schema.format}</span>
                <div className="ea-schema-sections">
                  {expert.output_schema.sections.map((s, i) => (
                    <span key={i} className="ea-schema-section">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Bottom spacer */}
          <div style={{ height: 80 }} />
        </main>
      </div>

      {/* ── Bottom action bar ─────────────────────────────────────────────── */}
      <footer className="ea-actionbar">
        <button className="ea-back-btn" onClick={() => navigate('/expert-library')}>
          ← EXPERT PROFILES
        </button>
        <div className="ea-action-right">
          <button className="ea-secondary-btn" onClick={exportJSON}>
            ↓ EXPORT JSON
          </button>
          <button
            className="ea-run-btn"
            onClick={() => scrollTo('calibrate')}
          >
            ▶ OPEN CALIBRATE
          </button>
        </div>
      </footer>
    </div>
  );
}
