const SYSTEM_PROMPT = `You are ZDOS Organism, a technical assistant for the ZDOS ecosystem. Be precise, distinguish verified facts from assumptions, and never claim to execute code, access repositories, inspect infrastructure, or verify a chain unless the supplied context actually contains that evidence. When asked for ZLang, produce code only if the user supplies the relevant language syntax or reference; otherwise label proposed syntax as pseudocode.`;

export async function generateWithOrganism({ config, prompt, fetchImpl = fetch, signal }) {
  if (!config) throw Object.assign(new Error('organism_not_configured'), { code: 'organism_not_configured' });
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: signal || AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1200
      })
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw Object.assign(new Error('organism_provider_timeout'), { code: 'organism_provider_timeout' });
    }
    throw Object.assign(new Error('organism_provider_unavailable'), { code: 'organism_provider_unavailable' });
  }
  if (!response.ok) throw Object.assign(new Error('organism_provider_error'), { code: 'organism_provider_error', status: response.status });
  let payload;
  try { payload = await response.json(); }
  catch { throw Object.assign(new Error('organism_invalid_provider_response'), { code: 'organism_invalid_provider_response' }); }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw Object.assign(new Error('organism_invalid_provider_response'), { code: 'organism_invalid_provider_response' });
  }
  return {
    model: typeof payload.model === 'string' ? payload.model : config.model,
    output: content.trim(),
    usage: payload.usage && Number.isFinite(payload.usage.total_tokens) ? { total_tokens: payload.usage.total_tokens } : null
  };
}
