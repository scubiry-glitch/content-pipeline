-- Expert Library — Migration 002: 知识源语义检索升级
-- 添加 embedding 列，用 pgvector cosine 相似度替代 ILIKE 全文检索
-- 依赖: pgvector 扩展已安装 (CREATE EXTENSION vector)

CREATE EXTENSION IF NOT EXISTS vector;

-- 为知识源添加向量嵌入列 (text-embedding-3-large = 3072维; 3-small / ada-002 = 1536维)
ALTER TABLE expert_knowledge_sources
  ADD COLUMN IF NOT EXISTS content_embedding vector(1536);

-- 创建向量相似度索引 (IVFFlat，适合中小规模数据集)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON expert_knowledge_sources
  USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 10);
