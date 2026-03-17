// 数据导出工具函数

/**
 * 导出任务列表为Excel/CSV格式
 */
export function exportTasksToCSV(tasks: Array<{
  id: string;
  topic: string;
  status: string;
  target_formats?: string[];
  created_at: string;
  due_date?: string;
  progress?: number;
}>, filename = 'tasks_export') {
  // CSV 表头
  const headers = ['任务ID', '主题', '状态', '目标格式', '创建时间', '截止日期', '进度'];

  // CSV 数据行
  const rows = tasks.map(task => [
    task.id,
    `"${task.topic.replace(/"/g, '""')}"`, // 转义引号
    task.status,
    (task.target_formats || ['markdown']).join(', '),
    new Date(task.created_at).toLocaleString('zh-CN'),
    task.due_date ? new Date(task.due_date).toLocaleDateString('zh-CN') : '-',
    `${task.progress || 0}%`
  ]);

  // 构建 CSV 内容
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

  // 添加 BOM 以支持中文
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // 下载文件
  downloadBlob(blob, `${filename}_${formatDate(new Date())}.csv`);
}

/**
 * 导出素材列表为JSON格式
 */
export function exportAssetsToJSON(assets: Array<{
  id: string;
  title: string;
  source?: string;
  tags?: string[];
  created_at: string;
}>, filename = 'assets_export') {
  const data = {
    export_time: new Date().toISOString(),
    total: assets.length,
    assets: assets
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${formatDate(new Date())}.json`);
}

/**
 * 导出图表为图片
 */
export function exportChartToImage(chartElement: HTMLElement, filename = 'chart') {
  // 使用 html2canvas 或类似库将图表转换为图片
  // 这里提供一个简单的实现，实际项目中可以使用 html2canvas
  const svg = chartElement.querySelector('svg');
  if (svg) {
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      downloadDataURL(pngFile, `${filename}_${formatDate(new Date())}.png`);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }
}

/**
 * 导出任务报告为PDF格式（简化版）
 */
export function generateTaskReport(tasks: Array<{
  id: string;
  topic: string;
  status: string;
  progress?: number;
  created_at: string;
}>, filename = 'task_report') {
  // 生成简单的 HTML 报告
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>任务报告</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; border-bottom: 2px solid #D46648; padding-bottom: 10px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #D46648; color: white; }
    tr:hover { background: #f5f5f5; }
    .status-completed { color: #7A9E6B; font-weight: bold; }
    .status-pending { color: #D46648; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h1>📋 任务报告</h1>
  <div class="summary">
    <p><strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
    <p><strong>任务总数:</strong> ${tasks.length}</p>
    <p><strong>已完成:</strong> ${tasks.filter(t => t.status === 'completed').length}</p>
    <p><strong>进行中:</strong> ${tasks.filter(t => t.status !== 'completed' && t.status !== 'pending').length}</p>
    <p><strong>待处理:</strong> ${tasks.filter(t => t.status === 'pending').length}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>主题</th>
        <th>状态</th>
        <th>进度</th>
        <th>创建时间</th>
      </tr>
    </thead>
    <tbody>
      ${tasks.map(task => `
        <tr>
          <td>${task.topic}</td>
          <td class="status-${task.status}">${getStatusText(task.status)}</td>
          <td>${task.progress || 0}%</td>
          <td>${new Date(task.created_at).toLocaleDateString('zh-CN')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="footer">
    由内容生产流水线系统生成
  </div>
</body>
</html>
  `;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${formatDate(new Date())}.html`);
}

/**
 * 下载 Blob 文件
 */
function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * 下载 DataURL 文件
 */
function downloadDataURL(dataURL: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 格式化日期为文件名格式
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': '待处理',
    'planning': '选题中',
    'researching': '研究中',
    'writing': '写作中',
    'reviewing': '评审中',
    'completed': '已完成',
    'archived': '已归档'
  };
  return statusMap[status] || status;
}

/**
 * 复制到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}
