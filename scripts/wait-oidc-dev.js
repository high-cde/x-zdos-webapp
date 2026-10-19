const issuer = process.env.AUTH0_ISSUER;
if (!issuer) throw new Error('AUTH0_ISSUER is required');

const endpoint = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`);
for (let attempt = 1; attempt <= 60; attempt++) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const metadata = await response.json();
      if (metadata.issuer === issuer.replace(/\/$/, '')) {
        console.log(`OIDC discovery ready: ${metadata.issuer}`);
        process.exit(0);
      }
      throw new Error(`OIDC issuer mismatch: expected ${issuer}, received ${metadata.issuer}`);
    }
  } catch (error) {
    if (error.message.startsWith('OIDC issuer mismatch')) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
throw new Error(`OIDC discovery did not become ready at ${endpoint}`);
