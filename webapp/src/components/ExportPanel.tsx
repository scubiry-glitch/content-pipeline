// 导出面板 - Export Panel
import { useState } from 'react';

interface ExportPanelProps {
  content?: string;
  title?: string;
  taskId?: string;
}

type ExportFormat = 'markdown' | 'pdf' | 'word';
type ExportStatus = 'idle' | 'preparing' | 'exporting' | 'completed' | 'error';

interface ExportJob {
  id: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  downloadUrl?: string;
  errorMessage?: string;
}

export function ExportPanel({ content, title, taskId }: ExportPanelProps) {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');

  const formatOptions: Array<{ value: ExportFormat; label: string; icon: string; description: string }> = [
    { value: 'markdown', label: 'Markdown', icon: '📝', description: '纯文本格式，适合进一步编辑' },
    { value: 'pdf', label: 'PDF', icon: '📄', description: '正式文档格式，适合分享和打印' },
    { value: 'word', label: 'Word', icon: '📘', description: '可编辑文档格式，适合协作修改' },
  ];

  const handleExport = async () => {
    if (!content) {
      alert('暂无内容可导出');
      return;
    }

    const jobId = `job_${Date.now()}`;
    const newJob: ExportJob = {
      id: jobId,
      format: selectedFormat,
      status: 'preparing',
      progress: 0,
    };

    setJobs((prev) => [newJob, ...prev]);

    // 模拟导出进度
    simulateExport(jobId, selectedFormat);
  };

  const simulateExport = (jobId: string, format: ExportFormat) => {
    const steps = [
      { status: 'preparing' as ExportStatus, progress: 20, delay: 500 },
      { status: 'exporting' as ExportStatus, progress: 50, delay: 1000 },
      { status: 'exporting' as ExportStatus, progress: 80, delay: 1000 },
      { status: 'completed' as ExportStatus, progress: 100, delay: 500 },
    ];

    let currentStep = 0;

    const runStep = () => {
      if (currentStep >= steps.length) return;

      const step = steps[currentStep];
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: step.status,
                progress: step.progress,
                downloadUrl: step.status === 'completed' ? generateDownloadUrl(format) : undefined,
              }
            : job
        )
      );

      currentStep++;
      if (currentStep < steps.length) {
        setTimeout(runStep, step.delay);
      }
    };

    setTimeout(runStep, 100);
  };

  const generateDownloadUrl = (format: ExportFormat): string => {
    // 模拟生成下载链接
    const timestamp = Date.now();
    const filename = `${title || 'document'}_${timestamp}.${format === 'markdown' ? 'md' : format}`;
    return `blob:${filename}`;
  };

  const handleDownload = (job: ExportJob) => {
    if (!job.downloadUrl) return;

    // 创建 Blob 并下载
    const blob = new Blob([content || ''], { type: getMimeType(job.format) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'document'}.${getFileExtension(job.format)}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getMimeType = (format: ExportFormat): string => {
    switch (format) {
      case 'markdown':
        return 'text/markdown';
      case 'pdf':
        return 'application/pdf';
      case 'word':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return 'text/plain';
    }
  };

  const getFileExtension = (format: ExportFormat): string => {
    switch (format) {
      case 'markdown':
        return 'md';
      case 'pdf':
        return 'pdf';
      case 'word':
        return 'docx';
      default:
        return 'txt';
    }
  };

  const getStatusText = (status: ExportStatus): string => {
    switch (status) {
      case 'idle':
        return '等待中';
      case 'preparing':
        return '准备中';
      case 'exporting':
        return '导出中';
      case 'completed':
        return '已完成';
      case 'error':
        return '失败';
      default:
        return '未知';
    }
  };

  const getStatusIcon = (status: ExportStatus): string => {
    switch (status) {
      case 'preparing':
        return '⏳';
      case 'exporting':
        return '🔄';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '⏸️';
    }
  };

  const clearCompleted = () => {
    setJobs((prev) => prev.filter((job) => job.status !== 'completed'));
  };

  if (!content) {
    return (
      <div className="export-panel">
        <div className="no-content-data">
          <div className="info-icon">📭</div>
          <h4>暂无文稿内容</h4>
          <p>文稿生成后可导出为多种格式</p>
        </div>
      </div>
    );
  }

  return (
    <div className="export-panel">
      {/* 格式选择 */}
      <div className="format-selection">
        <h4 className="selection-title">选择导出格式</h4>
        <div className="format-options">
          {formatOptions.map((option) => (
            <div
              key={option.value}
              className={`format-option ${selectedFormat === option.value ? 'selected' : ''}`}
              onClick={() => setSelectedFormat(option.value)}
            >
              <span className="format-icon">{option.icon}</span>
              <div className="format-info">
                <span className="format-label">{option.label}</span>
                <span className="format-description">{option.description}</span>
              </div>
              <div className={`format-radio ${selectedFormat === option.value ? 'checked' : ''}`} />
            </div>
          ))}
        </div>
      </div>

      {/* 导出按钮 */}
      <div className="export-actions">
        <button className="btn btn-primary btn-export" onClick={handleExport}>
          <span className="export-icon">📤</span>
          开始导出
        </button>
      </div>

      {/* 导出任务列表 */}
      {jobs.length > 0 && (
        <div className="export-jobs">
          <div className="jobs-header">
            <h4 className="jobs-title">导出记录</h4>
            {jobs.some((job) => job.status === 'completed') && (
              <button className="btn btn-sm btn-text" onClick={clearCompleted}>
                清除已完成
              </button>
            )}
          </div>
          <div className="jobs-list">
            {jobs.map((job) => (
              <div key={job.id} className={`job-item ${job.status}`}>
                <div className="job-info">
                  <span className="job-status-icon">{getStatusIcon(job.status)}</span>
                  <div className="job-details">
                    <span className="job-format">
                      {formatOptions.find((o) => o.value === job.format)?.label}
                    </span>
                    <span className="job-status-text">{getStatusText(job.status)}</span>
                  </div>
                </div>
                <div className="job-progress">
                  {job.status === 'completed' ? (
                    <button className="btn btn-sm btn-primary" onClick={() => handleDownload(job)}>
                      下载
                    </button>
                  ) : job.status === 'error' ? (
                    <span className="error-message">{job.errorMessage}</span>
                  ) : (
                    <>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                      </div>
                      <span className="progress-text">{job.progress}%</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 导出提示 */}
      <div className="export-tips">
        <h4 className="tips-title">💡 导出说明</h4>
        <ul className="tips-list">
          <li>Markdown 格式保留原始文本和格式标记</li>
          <li>PDF 格式适合正式场合分享和打印</li>
          <li>Word 格式保留格式且可进一步编辑</li>
          <li>导出过程可能需要几秒到几十秒，请耐心等待</li>
        </ul>
      </div>
    </div>
  );
}
