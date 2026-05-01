// PersonDrawer 全局 context
// 提供 openPerson(personId) / closePerson() 给所有子组件
// WorldShell 外层包一层 Provider，PersonDrawer 渲染当前 person 的右抽屉

import { createContext, useContext, useState, type ReactNode } from 'react';

interface Ctx {
  openPersonId: string | null;
  /** 通过 person id (mn_people.id) 打开抽屉 */
  openById: (id: string) => void;
  /** 通过名字打开 — drawer 自己模糊查 mn_people */
  openByName: (name: string) => void;
  close: () => void;
}

const PersonDrawerCtx = createContext<Ctx | null>(null);

export function PersonDrawerProvider({ children }: { children: ReactNode }) {
  // openPersonId 形态: 'id:<uuid>' 或 'name:<canonical_name>'
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);

  const ctx: Ctx = {
    openPersonId,
    openById: (id) => setOpenPersonId(`id:${id}`),
    openByName: (name) => setOpenPersonId(`name:${name}`),
    close: () => setOpenPersonId(null),
  };

  return <PersonDrawerCtx.Provider value={ctx}>{children}</PersonDrawerCtx.Provider>;
}

export function usePersonDrawer(): Ctx {
  const ctx = useContext(PersonDrawerCtx);
  if (!ctx) {
    // 容错：不在 Provider 内时返回 noop（避免崩页）
    return {
      openPersonId: null,
      openById: () => {},
      openByName: () => {},
      close: () => {},
    };
  }
  return ctx;
}
