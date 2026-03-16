# RSS数据库Schema

## 表结构

### rss_articles
存储抓取的RSS文章

```sql
CREATE TABLE IF NOT EXISTS rss_articles (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  summary TEXT,
  content TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  hot_score INTEGER,
  keywords TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### rss_sources
RSS源状态跟踪

```sql
CREATE TABLE IF NOT EXISTS rss_sources (
  id VARCHAR(50) PRIMARY KEY,
  last_fetch_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  article_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### hot_topics
热点话题存储

```sql
CREATE TABLE IF NOT EXISTS hot_topics (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  score INTEGER NOT NULL,
  source VARCHAR(50),
  url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  category VARCHAR(50)
);
```

## 索引

```sql
CREATE INDEX idx_articles_source ON rss_articles(source_id);
CREATE INDEX idx_articles_published ON rss_articles(published_at DESC);
CREATE INDEX idx_articles_hot_score ON rss_articles(hot_score DESC);
CREATE INDEX idx_topics_score ON hot_topics(score DESC);
CREATE INDEX idx_topics_discovered ON hot_topics(discovered_at DESC);
```

## v3.1 新增表

### user_behaviors
用户行为追踪

```sql
CREATE TABLE user_behaviors (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  topic_id VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL, -- view/like/share/ignore
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_behaviors_user ON user_behaviors(user_id);
CREATE INDEX idx_behaviors_topic ON user_behaviors(topic_id);
CREATE INDEX idx_behaviors_timestamp ON user_behaviors(timestamp);
```

### user_profiles
用户兴趣画像

```sql
CREATE TABLE user_profiles (
  user_id VARCHAR(50) PRIMARY KEY,
  interests JSONB, -- {topic: weight}
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 组件关系

```
RSSFeedManager
    ├── RSSDatabaseIntegration (数据库操作)
    │       ├── initSchema()
    │       ├── saveArticle()
    │       ├── getLatestArticles()
    │       └── getTodayHotTopics()
    ├── RSSFetcher (抓取与解析)
    │       ├── parseRSS()
    │       ├── parseAtom()
    │       └── fetchBatch()
    ├── RSSPipeline (调度与聚合)
    │       ├── runFetchCycle()
    │       ├── discoverHotTopics()
    │       └── createSchedule()
    └── SmartRecommender (v3.1新增)
            ├── recordBehavior()
            ├── buildInterestProfile()
            ├── collaborativeFiltering()
            └── getRecommendations()
```
