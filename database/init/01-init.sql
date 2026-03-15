-- v3.0-alpha 数据库初始化脚本

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 租户元数据表 (public schema)
CREATE TABLE public.tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(63) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    status          VARCHAR(20) DEFAULT 'active',
    plan            VARCHAR(20) DEFAULT 'free',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    settings        JSONB DEFAULT '{}',
    quotas          JSONB DEFAULT '{"contents_per_month": 10, "api_calls_per_min": 100}'
);

-- 租户管理员
CREATE TABLE public.tenant_admins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) DEFAULT 'admin',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login      TIMESTAMPTZ,
    UNIQUE(tenant_id, email)
);

-- API Key 管理
CREATE TABLE public.api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    key_hash        VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(100),
    permissions     TEXT[] DEFAULT '{}',
    rate_limit      INT DEFAULT 100,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ
);

-- 创建默认租户
INSERT INTO public.tenants (id, slug, name, plan, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'default',
  'Default Tenant',
  'enterprise',
  'active'
) ON CONFLICT DO NOTHING;

-- 创建默认租户 schema
CREATE SCHEMA IF NOT EXISTS tenant_default;

-- 默认租户业务表
SET search_path TO tenant_default, public;

CREATE TABLE tenant_default.topics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    source_type     VARCHAR(50),
    source_data     JSONB,
    status          VARCHAR(20) DEFAULT 'pending',
    priority        INT DEFAULT 0,
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    approved_at     TIMESTAMPTZ,
    approved_by     UUID
);

CREATE TABLE tenant_default.research_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id        UUID REFERENCES tenant_default.topics(id),
    status          VARCHAR(20) DEFAULT 'pending',
    query           TEXT,
    sources         JSONB[],
    findings        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error_message   TEXT
);

CREATE TABLE tenant_default.contents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id        UUID REFERENCES tenant_default.topics(id),
    status          VARCHAR(20) DEFAULT 'draft',
    outline         JSONB,
    outline_version INT DEFAULT 0,
    title           VARCHAR(500),
    body            TEXT,
    body_version    INT DEFAULT 0,
    word_count      INT,
    reading_time    INT,
    tags            TEXT[],
    blue_team_score INT,
    blue_team_feedback JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    published_at    TIMESTAMPTZ,
    published_by    UUID
);

CREATE TABLE tenant_default.blue_team_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id      UUID REFERENCES tenant_default.contents(id),
    review_type     VARCHAR(20),
    expert_role     VARCHAR(20),
    score           INT,
    feedback        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_default.publishes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id      UUID REFERENCES tenant_default.contents(id),
    platform        VARCHAR(50),
    platform_config JSONB,
    status          VARCHAR(20) DEFAULT 'pending',
    external_url    VARCHAR(500),
    published_at    TIMESTAMPTZ,
    error_message   TEXT
);

CREATE TABLE tenant_default.audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action          VARCHAR(50) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    actor_id        UUID,
    changes         JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 恢复默认 schema
SET search_path TO public;
