// PersonChip · 可点 person 标签
// 点击调用 PersonDrawer Provider 打开右抽屉
// 显示首字头像 + 姓名（可选 role 灰字）

import { usePersonDrawer } from './PersonDrawerProvider';

interface Props {
  /** 优先 personId (UUID)；没有就用 name 模糊查 */
  personId?: string | null;
  name: string;
  role?: string | null;
  /** 主题色：默认金 */
  tone?: string;
  size?: 'sm' | 'md';
}

function initialOf(name: string): string {
  if (!name) return '?';
  const trimmed = name.trim();
  return trimmed[0] ?? '?';
}

export function PersonChip({ personId, name, role, tone = '#D4A84B', size = 'md' }: Props) {
  const { openById, openByName } = usePersonDrawer();
  const isMd = size === 'md';

  const handle = () => {
    if (personId) openById(personId);
    else openByName(name);
  };

  return (
    <button
      onClick={handle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isMd ? 6 : 4,
        padding: isMd ? '3px 8px 3px 3px' : '2px 6px 2px 2px',
        background: `${tone}12`,
        border: `1px solid ${tone}40`,
        borderRadius: 99,
        cursor: 'pointer',
        fontFamily: 'var(--sans)',
        color: 'inherit',
      }}
      title={`查看 ${name} 的详情`}
    >
      <span
        style={{
          width: isMd ? 22 : 18,
          height: isMd ? 22 : 18,
          borderRadius: '50%',
          background: tone,
          color: '#0F0E15',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: isMd ? 12 : 10.5,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initialOf(name)}
      </span>
      <span
        style={{
          fontSize: isMd ? 12.5 : 11,
          color: tone,
          fontWeight: 500,
        }}
      >
        {name}
      </span>
      {role && (
        <span
          style={{
            fontSize: isMd ? 10 : 9,
            color: 'rgba(255,255,255,0.4)',
            fontFamily: 'var(--mono)',
          }}
        >
          {role}
        </span>
      )}
    </button>
  );
}
