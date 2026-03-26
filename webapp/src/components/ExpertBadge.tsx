// ExpertBadge.tsx
// 专家徽章组件

import React from 'react';
import type { Expert } from '../types';

interface ExpertBadgeProps {
  expert: Expert | { name: string; role?: string; avatar?: string };
  size?: 'sm' | 'md' | 'lg';
  showRole?: boolean;
}

export function ExpertBadge({ expert, size = 'md', showRole = true }: ExpertBadgeProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const nameSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const expertName = 'name' in expert ? expert.name : 'Unknown';
  const expertRole = 'role' in expert && expert.role ? expert.role : 
                    'angle' in expert && expert.angle ? expert.angle : 
                    'expert';
  const avatar = 'avatar' in expert && expert.avatar ? expert.avatar :
                 'profile' in expert && expert.profile?.avatar ? expert.profile.avatar :
                 null;

  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        <img
          src={avatar}
          alt={expertName}
          className={`${sizeClasses[size]} rounded-full object-cover border border-gray-200`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-medium`}
        >
          {expertName.charAt(0).toUpperCase()}
        </div>
      )}
      {showRole && (
        <div className="flex flex-col">
          <span className={`${nameSizeClasses[size]} font-medium text-gray-900`}>
            {expertName}
          </span>
          <span className="text-xs text-gray-500 capitalize">{expertRole}</span>
        </div>
      )}
    </div>
  );
}

export default ExpertBadge;
