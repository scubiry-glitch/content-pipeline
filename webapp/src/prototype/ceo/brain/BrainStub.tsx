// Brain 子页路由分发
// PR1 占位 → PR11 实装 (tasks 跨模块队列 / 其他 4 页摘要+深链)

import { useParams } from 'react-router-dom';
import { TasksRoom } from './TasksRoom';
import { SummaryRoom } from './SummaryRoom';
import {
  CONTENT_LIBRARY_INTRO,
  CONTENT_LIBRARY_CARDS,
  EXPERT_LIBRARY_INTRO,
  EXPERT_LIBRARY_CARDS,
  ASSETS_INTRO,
  ASSETS_CARDS,
  HOT_TOPICS_INTRO,
  HOT_TOPICS_CARDS,
} from './_brainConfigs';

export function BrainStub() {
  const { sub } = useParams<{ sub: string }>();
  switch (sub) {
    case 'tasks':
      return <TasksRoom />;
    case 'content-library':
      return <SummaryRoom intro={CONTENT_LIBRARY_INTRO} cards={CONTENT_LIBRARY_CARDS} />;
    case 'expert-library':
      return <SummaryRoom intro={EXPERT_LIBRARY_INTRO} cards={EXPERT_LIBRARY_CARDS} />;
    case 'assets':
      return <SummaryRoom intro={ASSETS_INTRO} cards={ASSETS_CARDS} />;
    case 'hot-topics':
      return <SummaryRoom intro={HOT_TOPICS_INTRO} cards={HOT_TOPICS_CARDS} />;
    default:
      return (
        <div style={{ color: 'rgba(232,220,196,0.6)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
          未知子页: {sub}
        </div>
      );
  }
}

export default BrainStub;
