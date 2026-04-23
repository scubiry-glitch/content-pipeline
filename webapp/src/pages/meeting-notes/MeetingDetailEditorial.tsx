// MeetingDetailEditorial — 变体 A · 长文精读
// 页面 4/12

export function MeetingDetailEditorial({ meetingId, data }: { meetingId: string; data: any }) {
  const sections: Array<{ id: string; title: string; body: any[] }> = data?.sections ?? [];
  return (
    <article className="max-w-3xl mx-auto bg-white p-10 rounded shadow-sm">
      <div className="text-xs font-mono uppercase text-gray-400 tracking-widest mb-2">
        meeting · {meetingId.slice(0, 8)}
      </div>
      <h1 className="text-3xl font-serif font-semibold mb-8">会议纪要 · 精读版</h1>
      {sections.map((sec) => (
        <section key={sec.id} className="mb-10">
          <h2 className="text-xl font-serif font-semibold text-stone-900 mb-3 border-l-2 border-amber-500 pl-3">
            {sec.title}
          </h2>
          {Array.isArray(sec.body) && sec.body.length === 0 ? (
            <p className="text-sm text-gray-400">（本节暂无抽取出的内容）</p>
          ) : Array.isArray(sec.body) ? (
            <ul className="flex flex-col gap-3">
              {sec.body.slice(0, 12).map((item: any, i: number) => (
                <li key={i} className="text-sm leading-relaxed text-stone-700">
                  {item.title || item.text || item.model_name || item.bias_type || item.rejected_path || JSON.stringify(item)}
                  {item.confidence !== undefined && (
                    <span className="ml-2 text-xs text-gray-400 font-mono">
                      conf {Number(item.confidence).toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <pre className="text-xs text-gray-500 bg-gray-50 p-3 rounded overflow-x-auto">
              {JSON.stringify(sec.body, null, 2)}
            </pre>
          )}
        </section>
      ))}
    </article>
  );
}
