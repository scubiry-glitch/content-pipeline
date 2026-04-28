// Taxonomy source-of-truth seed.
// - Edit here for initial rollout or fresh environments.
// - In production, /admin/taxonomy writes DB directly; use its "Export" button
//   to regenerate this file when you want to version the live state.
// - `sync()` upserts this list into taxonomy_domains. Codes missing here are
//   marked is_active=false (never deleted) to protect historical references.

export interface TaxonomyChildSeed {
  code: string;
  name: string;
}

export interface TaxonomySeed {
  code: string;
  name: string;
  icon?: string;
  color?: string;
  children?: TaxonomyChildSeed[];
}

export const TAXONOMY: TaxonomySeed[] = [
  {
    code: 'E01',
    name: '宏观经济',
    icon: '📊',
    color: '#1677ff',
    children: [
      { code: 'E01.MONETARY', name: '货币政策' },
      { code: 'E01.FISCAL',   name: '财政政策' },
      { code: 'E01.INFLATE',  name: '通胀与物价' },
      { code: 'E01.EMPLOY',   name: '就业与人口' },
      { code: 'E01.TRADE',    name: '贸易与汇率' },
      { code: 'E01.GROWTH',   name: '增长与周期' },
      { code: 'E01.DEBT',     name: '债务与利率' },
    ],
  },
  {
    code: 'E02',
    name: '金融科技',
    icon: '🏦',
    color: '#13c2c2',
    children: [
      { code: 'E02.BANK',   name: '银行与支付' },
      { code: 'E02.INSUR',  name: '保险' },
      { code: 'E02.ASSET',  name: '资产管理' },
      { code: 'E02.CRYPTO', name: '加密与数字资产' },
      { code: 'E02.REG',    name: '金融监管' },
      { code: 'E02.INFRA',  name: '金融基础设施' },
      { code: 'E02.CONSUM', name: '消费金融' },
    ],
  },
  {
    code: 'E03',
    name: '新能源',
    icon: '⚡',
    color: '#52c41a',
    children: [
      { code: 'E03.SOLAR',   name: '光伏' },
      { code: 'E03.WIND',    name: '风电' },
      { code: 'E03.STORAGE', name: '储能' },
      { code: 'E03.HYDRO',   name: '氢能' },
      { code: 'E03.BATTERY', name: '动力电池' },
      { code: 'E03.EV',      name: '电动车产业链' },
      { code: 'E03.GRID',    name: '智能电网' },
    ],
  },
  {
    code: 'E04',
    name: '医疗健康',
    icon: '🩺',
    color: '#f5222d',
    children: [
      { code: 'E04.PHARMA',  name: '创新药' },
      { code: 'E04.DEVICE',  name: '医疗器械' },
      { code: 'E04.CXO',     name: '医疗外包' },
      { code: 'E04.BIOTECH', name: '生物科技' },
      { code: 'E04.DIGITAL', name: '数字医疗' },
      { code: 'E04.SERVICE', name: '医院与服务' },
      { code: 'E04.PAYER',   name: '医保与支付' },
    ],
  },
  {
    code: 'E05',
    name: '消费零售',
    icon: '🛍️',
    color: '#fa8c16',
    children: [
      { code: 'E05.FOOD',        name: '食品饮料' },
      { code: 'E05.BEAUTY',      name: '美妆个护' },
      { code: 'E05.APPAREL',     name: '服装家纺' },
      { code: 'E05.HOME',        name: '家居家电' },
      { code: 'E05.RESTO',       name: '餐饮连锁' },
      { code: 'E05.ECOM',        name: '电商与新零售' },
      { code: 'E05.BRAND',       name: '消费品牌' },
      { code: 'E05.HOSPITALITY', name: '酒店与旅游' },
    ],
  },
  {
    code: 'E06',
    name: '半导体',
    icon: '💾',
    color: '#722ed1',
    children: [
      { code: 'E06.DESIGN', name: '芯片设计' },
      { code: 'E06.FAB',    name: '晶圆制造' },
      { code: 'E06.EQUIP',  name: '半导体设备' },
      { code: 'E06.MAT',    name: '半导体材料' },
      { code: 'E06.PACK',   name: '封装测试' },
      { code: 'E06.EDA',    name: 'EDA/IP' },
      { code: 'E06.MEM',    name: '存储芯片' },
      { code: 'E06.POWER',  name: '功率半导体' },
    ],
  },
  {
    code: 'E07',
    name: '人工智能',
    icon: '🤖',
    color: '#2f54eb',
    children: [
      { code: 'E07.LLM',   name: '大模型' },
      { code: 'E07.AGENT', name: 'Agent与多智能体' },
      { code: 'E07.MM',    name: '多模态' },
      { code: 'E07.INFRA', name: 'AI 基础设施' },
      { code: 'E07.CHIP',  name: 'AI 芯片' },
      { code: 'E07.ROBOT', name: '具身智能' },
      { code: 'E07.APP',   name: 'AI 应用' },
      { code: 'E07.ML',    name: '传统机器学习' },
    ],
  },
  {
    code: 'E08',
    name: '房地产',
    icon: '🏢',
    color: '#a0522d',
    children: [
      { code: 'E08.RESID',  name: '住宅' },
      { code: 'E08.COMM',   name: '商业地产' },
      { code: 'E08.INDUS',  name: '产业/物流地产' },
      { code: 'E08.REIT',   name: 'REITs与不动产金融' },
      { code: 'E08.RENT',   name: '租赁与长租' },
      { code: 'E08.POLICY', name: '住房政策' },
    ],
  },
  {
    code: 'E09',
    name: '文化传媒',
    icon: '🎬',
    color: '#eb2f96',
    children: [
      { code: 'E09.GAME',    name: '游戏' },
      { code: 'E09.FILM',    name: '影视' },
      { code: 'E09.MUSIC',   name: '音乐' },
      { code: 'E09.CONTENT', name: '内容平台' },
      { code: 'E09.SOCIAL',  name: '社交媒体' },
      { code: 'E09.ADS',     name: '营销广告' },
      { code: 'E09.IP',      name: 'IP与版权' },
    ],
  },
  {
    code: 'E10',
    name: '先进制造',
    icon: '🏭',
    color: '#595959',
    children: [
      { code: 'E10.ROBOT',     name: '工业机器人' },
      { code: 'E10.CNC',       name: '数控与精密加工' },
      { code: 'E10.AERO',      name: '航空航天' },
      { code: 'E10.SHIP',      name: '船舶海工' },
      { code: 'E10.AUTO',      name: '汽车制造' },
      { code: 'E10.MAT',       name: '新材料' },
      { code: 'E10.SW',        name: '工业软件' },
      { code: 'E10.LOGISTICS', name: '物流与供应链' },
    ],
  },
  {
    code: 'E11',
    name: 'ESG可持续',
    icon: '🌱',
    color: '#389e0d',
    children: [
      { code: 'E11.CARBON',   name: '碳市场与碳中和' },
      { code: 'E11.CIRCULAR', name: '循环经济' },
      { code: 'E11.GOV',      name: '公司治理' },
      { code: 'E11.SOCIAL',   name: '社会责任' },
      { code: 'E11.GREEN',    name: '绿色金融' },
      { code: 'E11.CLIMATE',  name: '气候风险' },
    ],
  },
  {
    code: 'E12',
    name: '跨境出海',
    icon: '🌏',
    color: '#08979c',
    children: [
      { code: 'E12.ECOM',  name: '跨境电商' },
      { code: 'E12.BRAND', name: '品牌出海' },
      { code: 'E12.SAAS',  name: 'SaaS 出海' },
      { code: 'E12.GAME',  name: '游戏出海' },
      { code: 'E12.MANUF', name: '制造出海' },
      { code: 'E12.GEO',   name: '地缘与贸易政策' },
    ],
  },
  {
    code: 'E99',
    name: '其他',
    icon: '📁',
    color: '#8c8c8c',
    children: [
      { code: 'E99.USER', name: '用户自定义' },
    ],
  },
];

// Synonym dictionary used by backfill and taxonomyService.resolve().
// Ordered: more specific (sub-domain) tokens first so they match before their parent.
export const SYNONYMS: Array<{ tokens: string[]; code: string }> = [
  // E07 — AI
  { tokens: ['大模型', 'LLM', '语言模型'], code: 'E07.LLM' },
  { tokens: ['Agent', '智能体', '多智能体', 'AutoGPT'], code: 'E07.AGENT' },
  { tokens: ['多模态', 'Multimodal', 'Vision'], code: 'E07.MM' },
  { tokens: ['AI 芯片', 'AI芯片', 'GPU', '算力芯片'], code: 'E07.CHIP' },
  { tokens: ['具身智能', '机器人', 'Embodied'], code: 'E07.ROBOT' },
  { tokens: ['AI 应用', 'AI应用', 'AIGC', '科技服务', '科技/服务', '办公软件'], code: 'E07.APP' },
  { tokens: ['机器学习', 'ML', '传统机器学习'], code: 'E07.ML' },
  { tokens: ['AI 基础设施', 'AI Infra', '训练框架'], code: 'E07.INFRA' },
  { tokens: ['AI', '人工智能', '生成式 AI'], code: 'E07' },

  // E06 — Semiconductor
  { tokens: ['芯片设计', 'Fabless'], code: 'E06.DESIGN' },
  { tokens: ['晶圆制造', 'Foundry', '代工'], code: 'E06.FAB' },
  { tokens: ['半导体设备', 'ASML', '光刻机'], code: 'E06.EQUIP' },
  { tokens: ['半导体材料'], code: 'E06.MAT' },
  { tokens: ['封装测试', '封测'], code: 'E06.PACK' },
  { tokens: ['EDA', 'IP 核'], code: 'E06.EDA' },
  { tokens: ['存储芯片', 'DRAM', 'NAND'], code: 'E06.MEM' },
  { tokens: ['功率半导体', 'IGBT', 'SiC'], code: 'E06.POWER' },
  { tokens: ['芯片', '半导体', 'IC'], code: 'E06' },

  // E03 — New energy
  { tokens: ['光伏', '硅料', '组件'], code: 'E03.SOLAR' },
  { tokens: ['风电', '海上风电'], code: 'E03.WIND' },
  { tokens: ['储能'], code: 'E03.STORAGE' },
  { tokens: ['氢能', '燃料电池'], code: 'E03.HYDRO' },
  { tokens: ['动力电池', '锂电池'], code: 'E03.BATTERY' },
  { tokens: ['电动车', '新能源车', 'EV'], code: 'E03.EV' },
  { tokens: ['智能电网', '特高压'], code: 'E03.GRID' },
  { tokens: ['新能源', '清洁能源'], code: 'E03' },

  // E02 — Finance
  { tokens: ['银行', '支付', '移动支付', 'Fintech', '互联网消费金融', '供应链金融'], code: 'E02.BANK' },
  { tokens: ['保险'], code: 'E02.INSUR' },
  { tokens: ['资管', '资产管理', '基金', '财富管理', '智能投顾', '投资顾问', '投资咨询', '证券研究', '证券经纪', '证券', '非银行金融', '估值', '定价', '收入', '收入构成', '资产配置', '金融产品分销', 'Financial product distribution'], code: 'E02.ASSET' },
  { tokens: ['加密', '数字资产', '数字货币', 'Crypto', 'Web3'], code: 'E02.CRYPTO' },
  { tokens: ['金融监管', '数据风控', '风控'], code: 'E02.REG' },
  { tokens: ['金融基础设施', '清算', '交易所', '金融市场', '市场预测', '市场份额预测', '股票交易'], code: 'E02.INFRA' },
  { tokens: ['消费金融', '互联网借贷', '在线借贷', '在线贷款', 'Online Lending'], code: 'E02.CONSUM' },
  { tokens: ['金融', '金融科技'], code: 'E02' },

  // E08 — Real estate
  { tokens: ['住宅'], code: 'E08.RESID' },
  { tokens: ['商业地产'], code: 'E08.COMM' },
  { tokens: ['产业地产', '物流地产'], code: 'E08.INDUS' },
  { tokens: ['REITs', 'REIT', '不动产金融', '房地产资产管理', '房地产资管'], code: 'E08.REIT' },
  { tokens: ['住房租赁', '长租公寓', '长租', '租赁市场', '租赁运营', '租赁'], code: 'E08.RENT' },
  { tokens: ['住房政策'], code: 'E08.POLICY' },
  { tokens: ['地产', '房产', '房地产'], code: 'E08' },

  // E04 — Healthcare
  { tokens: ['创新药', '生物医药'], code: 'E04.PHARMA' },
  { tokens: ['医疗器械'], code: 'E04.DEVICE' },
  { tokens: ['CXO', '医疗外包', 'CRO', 'CDMO'], code: 'E04.CXO' },
  { tokens: ['生物科技', 'Biotech'], code: 'E04.BIOTECH' },
  { tokens: ['数字医疗', '互联网医疗'], code: 'E04.DIGITAL' },
  { tokens: ['医院', '医疗服务'], code: 'E04.SERVICE' },
  { tokens: ['医保', '医疗支付'], code: 'E04.PAYER' },
  { tokens: ['医药', '医疗'], code: 'E04' },

  // E09 — Culture / media
  { tokens: ['游戏'], code: 'E09.GAME' },
  { tokens: ['影视', '电影', '剧集'], code: 'E09.FILM' },
  { tokens: ['音乐'], code: 'E09.MUSIC' },
  { tokens: ['内容平台', '视频平台', '内容分发', '媒体/内容分发', '资讯', '科技媒体', '媒体/资讯', '媒体/技术资讯'], code: 'E09.CONTENT' },
  { tokens: ['社交', '社交媒体'], code: 'E09.SOCIAL' },
  { tokens: ['营销', '广告'], code: 'E09.ADS' },
  { tokens: ['IP', '版权'], code: 'E09.IP' },
  { tokens: ['文化', '传媒', '媒体'], code: 'E09' },

  // E11 — ESG
  { tokens: ['碳市场', '碳中和', '碳'], code: 'E11.CARBON' },
  { tokens: ['循环经济'], code: 'E11.CIRCULAR' },
  { tokens: ['公司治理', '公司战略', '公司财务', '平台经济', '管理模式'], code: 'E11.GOV' },
  { tokens: ['社会责任'], code: 'E11.SOCIAL' },
  { tokens: ['绿色金融'], code: 'E11.GREEN' },
  { tokens: ['气候风险'], code: 'E11.CLIMATE' },
  { tokens: ['ESG', '可持续'], code: 'E11' },

  // E12 — Cross border
  { tokens: ['跨境电商'], code: 'E12.ECOM' },
  { tokens: ['品牌出海'], code: 'E12.BRAND' },
  { tokens: ['SaaS 出海', 'SaaS出海'], code: 'E12.SAAS' },
  { tokens: ['游戏出海'], code: 'E12.GAME' },
  { tokens: ['制造出海'], code: 'E12.MANUF' },
  { tokens: ['地缘', '贸易政策'], code: 'E12.GEO' },
  { tokens: ['出海', '跨境', '海外布局', '海外'], code: 'E12' },

  // E10 — Advanced manufacturing
  { tokens: ['工业机器人'], code: 'E10.ROBOT' },
  { tokens: ['数控', '精密加工'], code: 'E10.CNC' },
  { tokens: ['航空航天', '航空', '航天', '航空业', '酒店/航空业'], code: 'E10.AERO' },
  { tokens: ['船舶', '海工'], code: 'E10.SHIP' },
  { tokens: ['汽车制造'], code: 'E10.AUTO' },
  { tokens: ['新材料'], code: 'E10.MAT' },
  { tokens: ['工业软件'], code: 'E10.SW' },
  { tokens: ['物流', '供应链', '物流与供应链'], code: 'E10.LOGISTICS' },
  { tokens: ['先进制造', '高端制造'], code: 'E10' },

  // E05 — Consumer
  { tokens: ['食品饮料', '饮料'], code: 'E05.FOOD' },
  { tokens: ['美妆', '个护'], code: 'E05.BEAUTY' },
  { tokens: ['服装', '家纺'], code: 'E05.APPAREL' },
  { tokens: ['家居', '家电'], code: 'E05.HOME' },
  { tokens: ['餐饮'], code: 'E05.RESTO' },
  { tokens: ['电商', '新零售'], code: 'E05.ECOM' },
  { tokens: ['消费品牌'], code: 'E05.BRAND' },
  { tokens: ['酒店', '酒店行业', '酒店旅游', '酒店与旅游', '住宿业', '酒店/住宿业', '酒店_住宿业', '旅游'], code: 'E05.HOSPITALITY' },
  { tokens: ['消费', '零售', '消费结构'], code: 'E05' },

  // E01 — Macro
  { tokens: ['货币政策'], code: 'E01.MONETARY' },
  { tokens: ['财政政策'], code: 'E01.FISCAL' },
  { tokens: ['通胀', 'CPI'], code: 'E01.INFLATE' },
  { tokens: ['就业', '人口', '人口/社会', '社会'], code: 'E01.EMPLOY' },
  { tokens: ['贸易', '汇率'], code: 'E01.TRADE' },
  { tokens: ['经济增长', '周期', '中国经济', '中国金融市场', '中国财富管理', '中国智能理财市场', '中国互联网'], code: 'E01.GROWTH' },
  { tokens: ['债务', '利率'], code: 'E01.DEBT' },
  { tokens: ['宏观经济', '宏观'], code: 'E01' },
];

export function flattenTaxonomy(): Array<{
  code: string;
  parent_code: string | null;
  name: string;
  level: number;
  icon: string | null;
  color: string | null;
  sort_order: number;
}> {
  const rows: ReturnType<typeof flattenTaxonomy> = [];
  TAXONOMY.forEach((node, i) => {
    rows.push({
      code: node.code,
      parent_code: null,
      name: node.name,
      level: 1,
      icon: node.icon ?? null,
      color: node.color ?? null,
      sort_order: i,
    });
    (node.children ?? []).forEach((child, j) => {
      rows.push({
        code: child.code,
        parent_code: node.code,
        name: child.name,
        level: 2,
        icon: null,
        color: null,
        sort_order: j,
      });
    });
  });
  return rows;
}
