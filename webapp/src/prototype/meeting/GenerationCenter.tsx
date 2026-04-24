// GenerationCenter — 生成中心（骨架阶段）
// 原型来源：/tmp/mn-proto/axis-regenerate.jsx GenerationCenter / QueueView / VersionsView / ScheduleView

import { Placeholder } from './_placeholder';

export function GenerationCenter() {
  return (
    <Placeholder
      title="生成中心"
      subtitle="queue / versions / schedule 三 tab —— 统一管理所有 axis run 的队列、版本历史、定时调度"
      protoSrc="axis-regenerate.jsx · GenerationCenter"
      phase={6}
      preview={
        <ul style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8, fontFamily: 'var(--sans)', paddingLeft: 18, margin: 0 }}>
          <li>Queue · 正在跑 + 队列等待（接 <code>listRuns({'{ state: "running" }'})</code> 轮询 + <code>cancelRun</code>）</li>
          <li>Versions · 某轴的历次快照 + diff（接 <code>listVersions</code> + <code>diffVersions</code>）</li>
          <li>Schedule · cron 规则（后端暂无路由，<b>保留 mock</b>）</li>
        </ul>
      }
    />
  );
}

export default GenerationCenter;
