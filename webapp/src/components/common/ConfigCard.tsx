import React from 'react';

interface ConfigCardProps {
  title: string;
  icon?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function ConfigCard({ title, icon, subtitle, children, className = '' }: ConfigCardProps) {
  return (
    <div className={`info-card input-card glass-card ${className}`}>
      <h3 className="card-title">
        {icon && <span className="icon mr-2">{icon}</span>}
        {title}
      </h3>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>}
      <div className="card-content mt-4">
        {children}
      </div>
    </div>
  );
}
