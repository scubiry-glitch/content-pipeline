// 内容库 Wiki 页面 — 生成、浏览、预览物化的 markdown wiki (Obsidian 兼容)
import { useState, useEffect } from 'react';
import { ProductMetaBar } from '../components/ContentLibraryProductMeta';

const API_BASE = '/api/v1/content-library';

interface WikiInfo {
  name: string;
  path: string;
  mtime: string;
}

interface WikiFile {
  path: string;
  category: string;
}

interface GenerateResult {
  wikiRoot: string;
  filesWritten: number;
  entities: number;
  concepts: number;
  sources: number;
  durationMs: number;
  errors: string[];
}

/** 把 [[wikilink]] 或 [[path|label]] 渲染成可点击链接 */
function renderWithWikilinks(
  markdown: string,
  onOpen: (path: string) => void
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(markdown)) !== null) {
    if (m.index > last) out.push(markdown.slice(last, m.index));
    const raw = m[1];
    const [target, label] = raw.includes('|') ? raw.split('|') : [raw, raw];
    const path = target.includes('/') ? `${target}.md` : `entities/${target}.md`;
    out.push(
      <button
        key={`wl-${key++}`}
        onClick={() => onOpen(path)}
        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
      >
        {label}
      </button>
    );
    last = re.lastIndex;
  }
  if (last < markdown.length) out.push(markdown.slice(last));
  return out;
}

/** 简单的 markdown 渲染 (标题/列表/段落，够用) */
function SimpleMarkdown({ content, onOpenWikilink }: { content: string; onOpenWikilink: (path: string) => void }) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let inFrontmatter = false;
  let frontmatterLines: string[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === '---') {
        inFrontmatter = false;
        blocks.push(
          <details key={`fm-${key++}`} className="mb-4 text-xs">
            <summary className="cursor-pointer text-gray-500">frontmatter ({frontmatterLines.length} lines)</summary>
            <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded overflow-x-auto">
              {frontmatterLines.join('\n')}
            </pre>
          </details>
        );
        frontmatterLines = [];
      } else {
        frontmatterLines.push(line);
      }
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push(<h1 key={key++} className="text-3xl font-bold mt-4 mb-3">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++} className="text-xl font-semibold mt-4 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++} className="text-lg font-semibold mt-3 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      blocks.push(
        <div key={key++} className="ml-4 my-1">
          • {renderWithWikilinks(line.slice(2), onOpenWikilink)}
        </div>
      );
    } else if (line.trim() === '') {
      blocks.push(<div key={key++} className="h-2" />);
    } else {
      blocks.push(
        <p key={key++} className="my-1 text-gray-700 dark:text-gray-300">
          {renderWithWikilinks(line, onOpenWikilink)}
        </p>
      );
    }
  }
  return <>{blocks}</>;
}

export function ContentLibraryWiki() {
  const [rootDir, setRootDir] = useState('./data/content-wiki');
  const [wikis, setWikis] = useState<WikiInfo[]>([]);
  const [activeWiki, setActiveWiki] = useState<string | null>(null);
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 生成面板
  const [showGen, setShowGen] = useState(false);
  const [genWikiRoot, setGenWikiRoot] = useState('./data/content-wiki/default');
  const [genDomainFilter, setGenDomainFilter] = useState('');
  const [genMaxEntities, setGenMaxEntities] = useState(500);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);

  // 加载已有 wiki 列表
  const loadWikis = async () => {
    try {
      const res = await fetch(`${API_BASE}/wiki/list?rootDir=${encodeURIComponent(rootDir)}`);
      if (res.ok) {
        const data = await res.json();
        setWikis(data.wikis || []);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { loadWikis(); }, []);

  // 加载 wiki 的文件列表
  const loadFiles = async (wikiRoot: string) => {
    setActiveWiki(wikiRoot);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/wiki/files?wikiRoot=${encodeURIComponent(wikiRoot)}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        // 默认打开 overview.md / index.md
        const defaultFile = (data.files || []).find((f: WikiFile) => f.path === 'overview.md' || f.path === 'index.md');
        if (defaultFile) {
          openFile(wikiRoot, defaultFile.path);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  // 读取单个 markdown 文件
  const openFile = async (wikiRoot: string, relPath: string) => {
    setActiveFile(relPath);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/wiki/preview?wikiRoot=${encodeURIComponent(wikiRoot)}&path=${encodeURIComponent(relPath)}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || '');
      } else {
        setContent(`# 404\n\n文件不存在: ${relPath}`);
      }
    } catch {
      setContent(`# 错误\n\n无法加载文件`);
    }
    setLoading(false);
  };

  // 生成 wiki
  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const body: Record<string, unknown> = {
        wikiRoot: genWikiRoot,
        maxEntities: genMaxEntities,
      };
      if (genDomainFilter) body.domainFilter = genDomainFilter;
      const res = await fetch(`${API_BASE}/wiki/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as GenerateResult;
        setGenResult(data);
        loadWikis();  // 刷新列表
      } else {
        alert(`生成失败: HTTP ${res.status}`);
      }
    } catch (err) {
      alert(`生成失败: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  // 处理 wikilink 点击
  const handleOpenWikilink = (relPath: string) => {
    if (activeWiki) openFile(activeWiki, relPath);
  };

  const filesByCategory = files.reduce<Record<string, WikiFile[]>>((acc, f) => {
    (acc[f.category] = acc[f.category] || []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wiki 物化视图</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            把内容库物化成 Markdown wiki (Obsidian 兼容)。受 <code className="text-xs">nashsu/llm_wiki</code> 启发。
          </p>
          <ProductMetaBar productKey="wiki" />
        </div>
        <button
          onClick={() => setShowGen(v => !v)}
          className="px-4 py-2 text-sm font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg"
        >
          ✦ 生成 Wiki
        </button>
      </div>

      {/* 生成面板 */}
      {showGen && (
        <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-3">生成新 Wiki</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Wiki 根目录 (服务器路径)</label>
              <input
                type="text" value={genWikiRoot}
                onChange={e => setGenWikiRoot(e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">领域过滤 (可选)</label>
              <input
                type="text" value={genDomainFilter}
                placeholder="如: AI芯片"
                onChange={e => setGenDomainFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">实体上限</label>
              <input
                type="number" min={10} max={2000} value={genMaxEntities}
                onChange={e => setGenMaxEntities(Math.min(2000, Math.max(10, Number(e.target.value) || 500)))}
                className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
              />
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? '生成中...' : '▶️ 开始生成'}
          </button>
          {genResult && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-indigo-200 dark:border-indigo-800">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div><span className="text-gray-500">文件数</span> <span className="font-bold text-indigo-600">{genResult.filesWritten}</span></div>
                <div><span className="text-gray-500">实体页</span> <span className="font-bold">{genResult.entities}</span></div>
                <div><span className="text-gray-500">概念页</span> <span className="font-bold">{genResult.concepts}</span></div>
                <div><span className="text-gray-500">来源页</span> <span className="font-bold">{genResult.sources}</span></div>
                <div><span className="text-gray-500">耗时</span> <span className="font-bold">{(genResult.durationMs / 1000).toFixed(1)}s</span></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">📁 {genResult.wikiRoot}</p>
              {genResult.errors && genResult.errors.length > 0 && (
                <details className="mt-2 text-xs text-red-600">
                  <summary>{genResult.errors.length} 个错误</summary>
                  <ul className="mt-1 ml-4">
                    {genResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Wiki 列表 + 文件浏览 + 预览 三栏布局 */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: '70vh' }}>
        {/* Wiki 列表 */}
        <div className="col-span-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 overflow-y-auto" style={{ maxHeight: '75vh' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">已生成 Wiki</h3>
            <button onClick={loadWikis} className="text-xs text-indigo-600 hover:underline">刷新</button>
          </div>
          {wikis.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">暂无，点击"生成 Wiki"开始</p>
          ) : (
            <ul className="space-y-1">
              {wikis.map(w => (
                <li key={w.path}>
                  <button
                    onClick={() => loadFiles(w.path)}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded ${
                      activeWiki === w.path
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium truncate">{w.name}</div>
                    <div className="text-[10px] text-gray-500">{new Date(w.mtime).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 文件列表 */}
        <div className="col-span-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 overflow-y-auto" style={{ maxHeight: '75vh' }}>
          {activeWiki ? (
            <>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">文件</h3>
              {(['root', 'entities', 'concepts', 'sources'] as const).map(cat => {
                const items = filesByCategory[cat] || [];
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="mb-3">
                    <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">
                      {cat === 'root' ? '顶层' : cat}
                    </div>
                    <ul className="space-y-0.5">
                      {items.slice(0, 100).map(f => (
                        <li key={f.path}>
                          <button
                            onClick={() => openFile(activeWiki, f.path)}
                            className={`w-full text-left px-2 py-1 text-xs rounded truncate ${
                              activeFile === f.path
                                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {f.path.replace(`${cat}/`, '')}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {items.length > 100 && <p className="text-[10px] text-gray-400 mt-1">... 还有 {items.length - 100} 个</p>}
                  </div>
                );
              })}
            </>
          ) : (
            <p className="text-xs text-gray-400 text-center py-6">选择一个 wiki 查看文件</p>
          )}
        </div>

        {/* 预览 */}
        <div className="col-span-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 overflow-y-auto" style={{ maxHeight: '75vh' }}>
          {activeFile ? (
            <>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 font-mono">{activeFile}</div>
              </div>
              {loading ? (
                <p className="text-gray-400 text-center py-8">加载中...</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <SimpleMarkdown content={content} onOpenWikilink={handleOpenWikilink} />
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-center py-16">选择一个文件预览</p>
          )}
        </div>
      </div>
    </div>
  );
}
