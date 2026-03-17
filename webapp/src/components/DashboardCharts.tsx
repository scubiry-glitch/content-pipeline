import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import './DashboardCharts.css';

// 任务趋势数据
const taskTrendData = [
  { date: '03-11', created: 5, completed: 3 },
  { date: '03-12', created: 8, completed: 5 },
  { date: '03-13', created: 4, completed: 6 },
  { date: '03-14', created: 10, completed: 7 },
  { date: '03-15', created: 6, completed: 8 },
  { date: '03-16', created: 9, completed: 5 },
  { date: '03-17', created: 7, completed: 9 },
];

// 阶段分布数据
const stageData = [
  { name: '策划阶段', value: 12, color: '#D46648' },
  { name: '研究阶段', value: 8, color: '#8A9A5B' },
  { name: '撰写阶段', value: 15, color: '#C67B5C' },
  { name: '审核阶段', value: 6, color: '#B88A6B' },
  { name: '已完成', value: 23, color: '#7A9E6B' },
];

// 素材类型数据
const assetTypeData = [
  { type: 'PDF研报', count: 45 },
  { type: '网页文章', count: 78 },
  { type: '图片素材', count: 32 },
  { type: '视频资料', count: 15 },
  { type: '其他', count: 20 },
];

// 热点趋势数据
const hotTopicData = [
  { name: 'AI技术', current: 85, previous: 72 },
  { name: '新能源', current: 68, previous: 65 },
  { name: '半导体', current: 92, previous: 88 },
  { name: '医疗', current: 55, previous: 60 },
  { name: '消费', current: 42, previous: 45 },
];

export function DashboardCharts() {
  return (
    <div className="dashboard-charts">
      {/* 任务趋势图 */}
      <div className="chart-card">
        <h3 className="chart-title">📈 任务趋势（近7天）</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={taskTrendData}>
            <defs>
              <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D46648" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#D46648" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8A9A5B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8A9A5B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
            <YAxis stroke="#6B7280" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="created"
              name="新建任务"
              stroke="#D46648"
              fillOpacity={1}
              fill="url(#colorCreated)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="completed"
              name="完成任务"
              stroke="#8A9A5B"
              fillOpacity={1}
              fill="url(#colorCompleted)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 阶段分布饼图 */}
      <div className="chart-card">
        <h3 className="chart-title">🥧 任务阶段分布</h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={stageData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
              dataKey="value"
            >
              {stageData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => [`${value}个任务`, name]}
            />
            <Legend
              verticalAlign="middle"
              align="right"
              layout="vertical"
              iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 素材类型统计 */}
      <div className="chart-card">
        <h3 className="chart-title">📊 素材类型统计</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={assetTypeData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis type="number" stroke="#6B7280" fontSize={12} />
            <YAxis
              dataKey="type"
              type="category"
              stroke="#6B7280"
              fontSize={12}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [`${value}个`, '数量']}
            />
            <Bar
              dataKey="count"
              name="素材数量"
              fill="#C67B5C"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 热点趋势对比 */}
      <div className="chart-card">
        <h3 className="chart-title">🔥 热点趋势对比</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={hotTopicData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" stroke="#6B7280" fontSize={12} />
            <YAxis stroke="#6B7280" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar
              dataKey="previous"
              name="上周热度"
              fill="#E5E7EB"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="current"
              name="本周热度"
              fill="#D46648"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
