# PostgreSQL Setup Implementation Plan
## Synthesized from 4 Parallel Workstreams

**Date:** 2026-03-16
**Objective:** Set up PostgreSQL with environment configuration and connection pooling

---

## Summary of Parallel Workstreams

| Workstream | Focus | Status | Key Owner |
|------------|-------|--------|-----------|
| A | Schema Design & Migrations | ✅ Complete | Schema Specialist |
| B | Environment & Secrets | ✅ Complete | DevOps Engineer |
| C | Connection Pooling | ✅ Complete | Backend Architect |
| D | Testing & Health Checks | ✅ Complete | QA Engineer |

---

## Conflicts Identified & Resolution

### Conflict 1: Pool Size Defaults
- **Workstream A** suggested: max 20 connections (for index building)
- **Workstream C** suggested: max 10 connections (conservative)
- **Resolution:** Use 10 max connections (Workstream C wins). Rationale: Better to start conservative; can scale up with monitoring data. Index building can use separate admin connection.

### Conflict 2: Database Naming
- **Workstream A** used: `app_database`
- **Workstream B** template had: `demo_db`
- **Resolution:** Standardize on `app_database` (Workstream A wins). More descriptive and production-ready.

### Conflict 3: SSL Mode Default
- **Workstream B** suggested: `disable` for local dev
- **Workstream C** implementation: `prefer` for flexibility
- **Resolution:** Use `disable` default (Workstream B wins). Local development shouldn't require SSL; production override via env var.

### Conflict 4: Timeout Values
- **Workstream C:** 30s connection timeout
- **Workstream D:** Tests expect 10s max
- **Resolution:** Use 30s for production, 10s for test environment. Document in .env.test

---

## Unified Implementation Steps

### Phase 1: Prerequisites (5 min)
```bash
# Install dependencies
npm install pg zod
npm install -D @types/pg vitest

# Copy environment template
cp .env.template .env
# Edit .env with your database credentials
```

### Phase 2: Database Setup (10 min)
```bash
# Create database and user (run as postgres superuser)
createdb app_database
createuser -P app_user  # enter password when prompted
psql -c "GRANT ALL PRIVILEGES ON DATABASE app_database TO app_user;"
```

### Phase 3: Schema Migration (5 min)
```bash
# Run initial schema
psql -d app_database -f schema.sql

# Or use node-pg-migrate for future migrations
npx node-pg-migrate up
```

### Phase 4: Validation (5 min)
```bash
# Run health checks
npm test

# Expected output:
# ✓ Database Health > should return healthy status
# ✓ Connection Pool > should handle concurrent connections
# ✓ Transactions > should commit transactions successfully
```

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Application   │────▶│   Pool Manager  │────▶│   PostgreSQL    │
│                 │     │  (pool.ts)      │     │   (app_database)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Circuit Breaker │
                       │ Exponential     │
                       │ Backoff         │
                       └─────────────────┘
```

### Component Responsibilities

| File | Workstream | Purpose |
|------|------------|---------|
| `config.ts` | B | Environment loading, validation |
| `pool.ts` | C | Connection pooling, resilience |
| `schema.sql` | A | Database schema |
| `health.test.ts` | D | Integration tests |

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_HOST` | localhost | PostgreSQL host |
| `DATABASE_PORT` | 5432 | PostgreSQL port |
| `DATABASE_NAME` | app_database | Database name |
| `DATABASE_USER` | app_user | Database user |
| `DATABASE_PASSWORD` | **required** | User password |
| `DATABASE_SSL_MODE` | disable | SSL mode (disable/require/prefer) |
| `DATABASE_POOL_MIN` | 2 | Minimum pool connections |
| `DATABASE_POOL_MAX` | 10 | Maximum pool connections |
| `DATABASE_TIMEOUT` | 30000 | Connection timeout (ms) |

### Pool Behavior

- **Cold start:** Min 2 connections always available
- **Peak load:** Scales to max 10 connections
- **Idle cleanup:** Connections released after 10s idle
- **Recycling:** Connections recycled after 1000 uses

---

## Testing Strategy

### Unit Tests
```bash
npm test
```

### Health Check Endpoint
```bash
curl http://localhost:3000/health/db
# {"status":"ok","latency":5}
```

### Load Testing
```bash
# Verify pool handles 50 concurrent requests
npm run test:load
```

---

## Production Checklist

- [ ] Use strong password for DATABASE_PASSWORD
- [ ] Change DATABASE_SSL_MODE to 'require'
- [ ] Set up external secrets manager (AWS Secrets Manager, etc.)
- [ ] Configure monitoring for pool metrics
- [ ] Set up automated backups
- [ ] Run migrations in CI/CD pipeline
- [ ] Enable PostgreSQL query logging for slow queries

---

## Rollback Plan

If issues occur:

1. **Database migration rollback:**
   ```bash
   npx node-pg-migrate down
   ```

2. **Connection pool issues:**
   - Reduce DATABASE_POOL_MAX to 5
   - Increase DATABASE_TIMEOUT to 60000

3. **Full rollback:**
   - Revert to previous application version
   - Database schema remains compatible

---

## Next Steps

1. ✅ Review this implementation plan
2. ⬜ Execute Phase 1-4 above
3. ⬜ Add application-specific migrations
4. ⬜ Set up production secrets management
5. ⬜ Configure monitoring dashboards

---

## References

- Workstream A: `parallel_A.md` - Schema design details
- Workstream B: `parallel_B.md` - Environment configuration
- Workstream C: `parallel_C.md` - Pool configuration
- Workstream D: `parallel_D.md` - Testing strategy
