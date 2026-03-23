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

    if (job.format === 'pdf') {
      // 使用浏览器打印转 PDF
      generatePDF();
      return;
    }

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

  const generatePDF = () => {
    // 打开新窗口并打印为 PDF
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以生成 PDF');
      return;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title || 'Document'}</title>
  <style>
    @page { margin: 2cm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { font-size: 24px; margin-bottom: 20px; color: #1a1a1a; }
    h2 { font-size: 20px; margin-top: 30px; margin-bottom: 15px; color: #2a2a2a; }
    h3 { font-size: 16px; margin-top: 20px; margin-bottom: 10px; color: #3a3a3a; }
    p { margin-bottom: 12px; }
    ul, ol { margin-bottom: 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
    }
    pre {
      background: #f8f8f8;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 0;
      padding-left: 16px;
      color: #666;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background: #f0f0f0; padding: 12px 20px; margin: -20px -20px 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 8px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
      点击此处打印 / 保存为 PDF
    </button>
    <p style="margin: 8px 0 0; font-size: 12px; color: #666;">提示：打印时选择"另存为 PDF"作为目标打印机</p>
  </div>
  ${markdownToHTML(content || '')}
</body>
</html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const markdownToHTML = (md: string): string => {
    // 简单的 Markdown 转 HTML
    return md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // 代码块
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 标题
      .replace(/^###### (.*$)/gim, '<h6>$1</h6>')
      .replace(/^##### (.*$)/gim, '<h5>$5</h5>')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // 粗体和斜体
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // 删除线
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      // 引用
      .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // 图片
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;">')
      // 无序列表
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      // 有序列表
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      // 水平线
      .replace(/^---$/gim, '<hr>')
      // 段落和换行
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // 包裹段落
      .replace(/^(.+)$/gim, '<p>$1</p>')
      // 清理空段落
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<h[1-6]>)/g, '$1')
      .replace(/(<\/h[1-6]>)<\/p>/g, '$1')
      .replace(/<p>(<pre>)/g, '$1')
      .replace(/(<\/pre>)<\/p>/g, '$1')
      .replace(/<p>(<blockquote>)/g, '$1')
      .replace(/(<\/blockquote>)<\/p>/g, '$1');
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
