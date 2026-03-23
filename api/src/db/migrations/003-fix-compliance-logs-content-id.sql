-- 修复 compliance_logs 表的 content_id 字段类型
-- 从 UUID 改为 VARCHAR 以支持任意内容ID（如 task_35aa8828）

ALTER TABLE compliance_logs 
ALTER COLUMN content_id TYPE VARCHAR(100);

-- 更新索引
DROP INDEX IF EXISTS idx_compliance_logs_content;
CREATE INDEX idx_compliance_logs_content ON compliance_logs (content_id, content_type);

-- 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.0.1-fix-compliance-logs', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
