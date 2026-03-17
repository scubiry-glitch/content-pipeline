import { useState } from 'react';
import {
  exportTasksToCSV,
  exportAssetsToJSON,
  generateTaskReport,
} from '../utils/export';
import './ExportButton.css';

interface ExportButtonProps {
  type: 'tasks' | 'assets' | 'reports';
  data: unknown[];
  filename?: string;
}

export function ExportButton({ type, data, filename }: ExportButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = (format: string) => {
    switch (type) {
      case 'tasks':
        if (format === 'csv') {
          exportTasksToCSV(data as Parameters<typeof exportTasksToCSV>[0], filename);
        } else if (format === 'html') {
          generateTaskReport(data as Parameters<typeof generateTaskReport>[0], filename);
        }
        break;
      case 'assets':
        if (format === 'json') {
          exportAssetsToJSON(data as Parameters<typeof exportAssetsToJSON>[0], filename);
        }
        break;
    }
    setShowMenu(false);
  };

  const exportOptions = {
    tasks: [
      { key: 'csv', label: '导出为 CSV', icon: '📊' },
      { key: 'html', label: '导出为 HTML报告', icon: '📄' },
    ],
    assets: [
      { key: 'json', label: '导出为 JSON', icon: '📋' },
    ],
    reports: [
      { key: 'csv', label: '导出为 CSV', icon: '📊' },
      { key: 'html', label: '导出为 HTML', icon: '📄' },
    ],
  };

  return (
    <div className="export-button-wrapper">
      <button
        className="btn btn-secondary export-btn"
        onClick={() => setShowMenu(!showMenu)}
      >
        📥 导出
      </button>
      {showMenu && (
        <>
          <div className="export-overlay" onClick={() => setShowMenu(false)} />
          <div className="export-menu">
            {exportOptions[type].map((option) => (
              <button
                key={option.key}
                className="export-option"
                onClick={() => handleExport(option.key)}
              >
                <span>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
