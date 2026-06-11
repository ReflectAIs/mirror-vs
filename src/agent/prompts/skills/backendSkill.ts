export function getBackendSkill(): string {
  return `### ⚙️ BACKEND API & BUSINESS LOGIC SKILL
1. **Endpoint Design**: Verify routing, middleware, payload validation, and HTTP status code alignment.
2. **Service Layer**: Keep controllers thin. Implement business logic inside core services or models.
3. **Database Rules**: Ensure atomic updates, database integrity, proper locking mechanisms, and query performance.
4. **Source of Truth**: Ensure updates map correctly to the true database state, preventing duplicate states in caching layers.`;
}
