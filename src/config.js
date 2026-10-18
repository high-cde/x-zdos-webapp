const requiredAuth = ['AUTH0_ISSUER', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'APP_BASE_URL', 'SESSION_SECRET'];

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const databaseConfigured = Boolean(env.DATABASE_URL);
  const authConfigured = requiredAuth.every((key) => Boolean(env[key]));
  const validSecret = (env.SESSION_SECRET?.length ?? 0) >= 32;
  const validIssuer = !env.AUTH0_ISSUER || /^https:\/\//.test(env.AUTH0_ISSUER);
  const validBaseUrl = !env.APP_BASE_URL || /^https:\/\//.test(env.APP_BASE_URL) || (!production && /^http:\/\//.test(env.APP_BASE_URL));
  const authReady = authConfigured && validSecret && validIssuer && validBaseUrl;
  const retention = Number(env.EVENT_RETENTION_DAYS ?? 365);
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) throw new Error('EVENT_RETENTION_DAYS must be an integer from 1 to 3650');
  if (production && (!databaseConfigured || !authReady)) throw new Error('Production startup denied: PostgreSQL and complete, valid Auth0 OIDC configuration are required');
  return {
    production,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || null,
    authReady,
    auth0: authReady ? {
      issuer: env.AUTH0_ISSUER,
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      baseUrl: env.APP_BASE_URL.replace(/\/$/, ''),
      sessionSecret: env.SESSION_SECRET
    } : null,
    eventRetentionDays: retention
  };
}
