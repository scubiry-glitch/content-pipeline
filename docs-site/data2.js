// 数据文件 2/3（v3.x/v4.x 智能化：热点/社区/合规/编排/Stage3/预测/Copilot/i18n/专家库）
function G(o){API_GROUPS.push(o);}

G({id:"g-qrep",title:"质量报告",prefix:"/api/v1/quality/reports",desc:"v3.4 内容质量输入：报告文档的解析与关联。",eps:[
["GET","/api/v1/quality/reports/","质量报告列表"],
["GET","/api/v1/quality/reports/:id","报告详情"],
["POST","/api/v1/quality/reports/upload","上传报告"],
["POST","/api/v1/quality/reports/:id/parse","解析报告"],
["GET","/api/v1/quality/reports/:id/related","报告相关内容"],
["PUT","/api/v1/quality/reports/:id","更新报告"],
["DELETE","/api/v1/quality/reports/:id","删除报告"],
]});

G({id:"g-hot",title:"热点话题",prefix:"/api/v1/quality/hot-topics",desc:"多平台热点发现、归并与追踪（含 RSS 与社区平台热榜聚合）。",eps:[
["GET","/api/v1/quality/hot-topics/","热点话题列表"],
["GET","/api/v1/quality/hot-topics/from-rss","从 RSS 生成热点"],
["GET","/api/v1/quality/hot-topics/:id","话题详情"],
["POST","/api/v1/quality/hot-topics/:id/follow","关注话题"],
["POST","/api/v1/quality/hot-topics/:id/unfollow","取消关注"],
["GET","/api/v1/quality/hot-topics/:id/trend","话题热度趋势"],
["POST","/api/v1/quality/hot-topics/crawl","触发热点抓取"],
["GET","/api/v1/quality/hot-topics/unified","归并后的统一话题"],
["GET","/api/v1/quality/hot-topics/cross-platform","跨平台话题对比"],
["GET","/api/v1/quality/hot-topics/by-source","按来源分组的热点"],
["POST","/api/v1/quality/hot-topics/unify","执行话题归并"],
["POST","/api/v1/quality/hot-topics/:id/verify","话题事实核验"],
["POST","/api/v1/quality/hot-topics/recalculate-scores","重算热度分数"],
["GET","/api/v1/quality/hot-topics/scheduler-status","热度定时任务状态"],
]});

G({id:"g-qas",title:"质量素材",prefix:"/api/v1/quality/assets",desc:"v3.4 质量素材（区别于主素材库，用于质量分析）。",eps:[
["GET","/api/v1/quality/assets/","质量素材列表"],
["GET","/api/v1/quality/assets/:id","素材详情"],
["POST","/api/v1/quality/assets/","创建质量素材"],
["POST","/api/v1/quality/assets/extract","从内容提取质量素材"],
["POST","/api/v1/quality/assets/:id/quote","引用素材"],
["PUT","/api/v1/quality/assets/:id","更新素材"],
["DELETE","/api/v1/quality/assets/:id","删除素材"],
]});

G({id:"g-com",title:"社区话题",prefix:"/api/v1/quality/community",desc:"v5.1 社区平台（小红书/微博/知乎）热点抓取与归并。",eps:[
["GET","/api/v1/quality/community/platforms","支持的平台列表"],
["POST","/api/v1/quality/community/crawl","触发社区热榜抓取"],
["GET","/api/v1/quality/community/topics","社区话题列表"],
["GET","/api/v1/quality/community/topics/by-platform","按平台分组话题"],
["GET","/api/v1/quality/community/topics/:id","话题详情"],
["GET","/api/v1/quality/community/xiaohongshu/hot","小红书热榜"],
["GET","/api/v1/quality/community/weibo/hot","微博热榜"],
["GET","/api/v1/quality/community/zhihu/hot","知乎热榜"],
["POST","/api/v1/quality/community/unify","社区话题归并"],
["GET","/api/v1/quality/community/unified","归并后话题"],
["GET","/api/v1/quality/community/unified/cross-platform","跨平台归并视图"],
["POST","/api/v1/quality/community/verify/:id","话题核验"],
["GET","/api/v1/quality/community/stats","社区话题统计"],
]});

G({id:"g-plan",title:"流式大纲（规划）",prefix:"/api/v1/planning",desc:"v5.1 分层大纲流式生成（SSE 实时输出）。",eps:[
["POST","/api/v1/planning/stream","启动大纲流式生成"],
["POST","/api/v1/planning/stream/sse","SSE 大纲生成通道"],
["GET","/api/v1/planning/stream/progress/:taskId","生成进度查询"],
["GET","/api/v1/planning/stream/versions/:taskId","生成版本列表"],
["POST","/api/v1/planning/stream/layer","分层补全（单层重新生成）"],
]});

G({id:"g-sbt",title:"流式蓝军评审",prefix:"/api/v1/streaming/blue-team",desc:"v5.2 蓝军评审实时 SSE 推送。",eps:[
["GET","/api/v1/streaming/blue-team/:taskId","获取评审流（SSE）"],
["POST","/api/v1/streaming/blue-team/:taskId/start","启动蓝军评审流"],
["GET","/api/v1/streaming/blue-team/:taskId/status","评审状态"],
]});

G({id:"g-sseq",title:"流式串行评审",prefix:"/api/v1/streaming/sequential",desc:"v5.2 串行评审实时 SSE 推送。",eps:[
["GET","/api/v1/streaming/sequential/:taskId","获取串行评审流（SSE）"],
["GET","/api/v1/streaming/sequential/:taskId/status","串行评审状态"],
]});

G({id:"g-cpl",title:"智能审核与合规 (v4.0)",prefix:"/api/v1/compliance",desc:"敏感词/广告法/版权/隐私检测与合规规则管理。",eps:[
["POST","/api/v1/compliance/check","执行合规检查（完整版）"],
["POST","/api/v1/compliance/quick-check","快速合规检查"],
["POST","/api/v1/compliance/fix","AI 自动修复合规问题"],
["GET","/api/v1/compliance/rules","合规规则列表"],
["GET","/api/v1/compliance/rules/:id","规则详情"],
["POST","/api/v1/compliance/rules","新增规则"],
["PUT","/api/v1/compliance/rules/:id","更新规则"],
["DELETE","/api/v1/compliance/rules/:id","删除规则"],
["GET","/api/v1/compliance/history","检查历史"],
]});

G({id:"g-orch",title:"智能流水线编排 (v4.1)",prefix:"/api/v1/orchestrator",desc:"条件触发器与动态路由（低分退回/热点加速等规则驱动）。",eps:[
["POST","/api/v1/orchestrator/process","执行编排处理"],
["GET","/api/v1/orchestrator/rules","工作流规则列表"],
["GET","/api/v1/orchestrator/queue","任务队列状态"],
["POST","/api/v1/orchestrator/queue","提交编排任务"],
]});

G({id:"g-s3",title:"Stage3 文稿增强 (v4.2)",prefix:"/api/v1/stage3",desc:"可视化标注、对话式修改、版本对比与修改追踪。",eps:[
["POST","/api/v1/stage3/annotations","创建标注"],
["GET","/api/v1/stage3/annotations","标注列表"],
["GET","/api/v1/stage3/annotations/:id","标注详情"],
["PATCH","/api/v1/stage3/annotations/:id","更新标注"],
["DELETE","/api/v1/stage3/annotations/:id","删除标注"],
["GET","/api/v1/stage3/annotations/stats","标注统计"],
["POST","/api/v1/stage3/versions","创建文稿版本"],
["POST","/api/v1/stage3/versions/auto-save","自动保存版本"],
["GET","/api/v1/stage3/versions","版本列表"],
["GET","/api/v1/stage3/versions/:id","版本详情"],
["DELETE","/api/v1/stage3/versions/:id","删除版本"],
["GET","/api/v1/stage3/versions/:id1/compare/:id2","版本对比"],
["POST","/api/v1/stage3/chat-sessions","创建对话修改会话"],
["GET","/api/v1/stage3/chat-sessions","会话列表"],
["GET","/api/v1/stage3/chat-sessions/:id","会话详情"],
["POST","/api/v1/stage3/chat-sessions/:id/messages","发送修改指令"],
["DELETE","/api/v1/stage3/chat-sessions/:id","删除会话"],
["GET","/api/v1/stage3/change-logs","修改日志列表"],
["GET","/api/v1/stage3/change-logs/:id","日志详情"],
["POST","/api/v1/stage3/change-logs","记录修改日志"],
]});

G({id:"g-pred",title:"内容效果预测 (v4.3)",prefix:"/api/v1/prediction",desc:"传播潜力评估、最佳发布时间与平台适配度预测。",eps:[
["POST","/api/v1/prediction/performance","发起效果预测"],
["GET","/api/v1/prediction/performance/:id","预测结果详情"],
["GET","/api/v1/prediction/performance","预测历史列表"],
["POST","/api/v1/prediction/schedule","生成发布排期建议"],
["POST","/api/v1/prediction/platforms","平台适配度评估"],
["POST","/api/v1/prediction/risks","风险预警分析"],
["POST","/api/v1/prediction/schedule/book","预约发布排期"],
["GET","/api/v1/prediction/schedule","排期列表"],
["DELETE","/api/v1/prediction/schedule/:id","取消排期"],
["GET","/api/v1/prediction/history/similar","相似历史内容（效果参考）"],
["POST","/api/v1/prediction/history/record","记录实际效果数据（回流）"],
]});

G({id:"g-cop",title:"智能助手 Copilot (v4.4)",prefix:"/api/v1/copilot",desc:"自然语言配置、主动建议与技能（skills）体系。",eps:[
["POST","/api/v1/copilot/sessions","创建会话"],
["GET","/api/v1/copilot/sessions","会话列表"],
["GET","/api/v1/copilot/sessions/:id","会话详情"],
["PATCH","/api/v1/copilot/sessions/:id","更新会话"],
["POST","/api/v1/copilot/sessions/:id/archive","归档会话"],
["DELETE","/api/v1/copilot/sessions/:id","删除会话"],
["POST","/api/v1/copilot/sessions/:id/messages","发送消息"],
["GET","/api/v1/copilot/sessions/:id/messages","消息历史"],
["POST","/api/v1/copilot/messages/:id/feedback","消息反馈"],
["GET","/api/v1/copilot/skills","技能列表"],
["GET","/api/v1/copilot/skills/:name","技能详情"],
["POST","/api/v1/copilot/skills","创建技能"],
["PATCH","/api/v1/copilot/skills/:name","更新技能"],
["DELETE","/api/v1/copilot/skills/:name","删除技能"],
["POST","/api/v1/copilot/skills/detect","技能自动识别"],
["GET","/api/v1/copilot/quick-actions","快捷操作列表"],
["POST","/api/v1/copilot/quick-actions/:id/execute","执行快捷操作"],
]});

G({id:"g-i18n",title:"多语言国际化 (v4.5)",prefix:"/api/v1/i18n",desc:"翻译、术语库与翻译记忆。",eps:[
["POST","/api/v1/i18n/translations","创建翻译任务"],
["POST","/api/v1/i18n/translations/batch","批量翻译"],
["GET","/api/v1/i18n/translations","翻译列表"],
["GET","/api/v1/i18n/translations/:id","翻译详情"],
["PATCH","/api/v1/i18n/translations/:id","更新翻译"],
["POST","/api/v1/i18n/translations/machine","机器翻译"],
["GET","/api/v1/i18n/translations/stats","翻译统计"],
["POST","/api/v1/i18n/terminology","新增术语"],
["GET","/api/v1/i18n/terminology/search","术语检索"],
["GET","/api/v1/i18n/terminology/:term","术语详情"],
["GET","/api/v1/i18n/terminology/category/:category","按分类列术语"],
["GET","/api/v1/i18n/terminology/:term/translate","术语翻译"],
["GET","/api/v1/i18n/languages","支持语言列表"],
["GET","/api/v1/i18n/languages/default","默认语言"],
["GET","/api/v1/i18n/languages/:code","语言详情"],
["PATCH","/api/v1/i18n/languages/:code","更新语言配置"],
["POST","/api/v1/i18n/memory","写入翻译记忆"],
["GET","/api/v1/i18n/memory/search","翻译记忆检索"],
]});

G({id:"g-exp",title:"专家库（旧版 v2.0）",prefix:"/api/v1/experts",desc:"旧版 keyword matching 专家接口，已被 expert-library 取代（保留兼容）。",eps:[
["GET","/api/v1/experts/","专家列表"],
["GET","/api/v1/experts/:id","专家详情"],
["POST","/api/v1/experts/","创建专家"],
["PUT","/api/v1/experts/:id","更新专家"],
["DELETE","/api/v1/experts/:id","删除专家"],
]});

G({id:"g-el",title:"专家库 Cognitive Digital Twin (v3.0)",prefix:"/api/v1/expert-library",desc:"认知数字孪生专家库：专家画像、知识库、心智模型图谱、辩论、调度与热点观点。",eps:[
["GET","/api/v1/expert-library/stats/overview","专家库统计概览"],
["POST","/api/v1/expert-library/invoke","单次专家任务（分析/评估/生成）"],
["POST","/api/v1/expert-library/chat","专家对话（单轮）"],
["POST","/api/v1/expert-library/chat/stream","专家对话（流式 SSE）"],
["GET","/api/v1/expert-library/experts","专家列表"],
["GET","/api/v1/expert-library/experts/:id","专家详情"],
["PATCH","/api/v1/expert-library/experts/:id","更新专家"],
["PUT","/api/v1/expert-library/experts/:id","全量更新专家"],
["POST","/api/v1/expert-library/experts","创建专家"],
["DELETE","/api/v1/expert-library/experts/:id","删除专家"],
["GET","/api/v1/expert-library/experts/full","专家完整信息（含 Profile）"],
["POST","/api/v1/expert-library/admin/sync-builtins","同步内置专家"],
["GET","/api/v1/expert-library/admin/sync-builtins/manifest","内置专家清单"],
["POST","/api/v1/expert-library/admin/sync-builtins/item","同步单个内置专家"],
["POST","/api/v1/expert-library/experts/research-generate","专家研究报告生成"],
["GET","/api/v1/expert-library/experts/:id/performance","专家表现评估"],
["GET","/api/v1/expert-library/experts/:id/invocations","专家调用历史"],
["GET","/api/v1/expert-library/experts/:id/feedback-history","专家反馈历史"],
["GET","/api/v1/expert-library/experts/:id/knowledge","专家知识条目"],
["POST","/api/v1/expert-library/experts/:id/knowledge","新增专家知识"],
["DELETE","/api/v1/expert-library/experts/:id/knowledge/:sid","删除专家知识"],
["POST","/api/v1/expert-library/match","专家匹配（按主题/任务）"],
["POST","/api/v1/expert-library/review-outline","专家大纲评审"],
["POST","/api/v1/expert-library/feedback","提交专家反馈"],
["POST","/api/v1/expert-library/debate","发起专家辩论"],
["GET","/api/v1/expert-library/debates","辩论列表"],
["GET","/api/v1/expert-library/debates/:id","辩论详情"],
["PATCH","/api/v1/expert-library/debates/:id/hide","隐藏辩论"],
["PATCH","/api/v1/expert-library/debates/:id/rate","辩论评分"],
["POST","/api/v1/expert-library/calibrate/:id","专家校准"],
["GET","/api/v1/expert-library/scheduling/workloads","专家工作负载"],
["GET","/api/v1/expert-library/scheduling/workload/:id","单个专家负载"],
["POST","/api/v1/expert-library/scheduling/assign","分配任务给专家"],
["POST","/api/v1/expert-library/scheduling/complete","标记任务完成"],
["GET","/api/v1/expert-library/scheduling/available","可用专家查询"],
["PUT","/api/v1/expert-library/scheduling/availability/:id","设置专家可用性"],
["POST","/api/v1/expert-library/scheduling/recommend","专家推荐（负载均衡）"],
["POST","/api/v1/expert-library/hot-topic-perspectives","生成热点话题专家观点"],
["GET","/api/v1/expert-library/hot-topic-perspectives/:topicId","查询话题观点"],
["POST","/api/v1/expert-library/asset-annotations","素材专家标注"],
["GET","/api/v1/expert-library/asset-annotations/:assetId","查询素材标注"],
["POST","/api/v1/expert-library/asset-credibility","素材可信度评估"],
["GET","/api/v1/expert-library/mental-models","心智模型图谱"],
["POST","/api/v1/expert-library/mental-models/refresh","重建心智模型图谱"],
["GET","/api/v1/expert-library/mental-models/catalog","心智模型目录"],
["GET","/api/v1/expert-library/mental-models/:name","心智模型详情"],
]});
