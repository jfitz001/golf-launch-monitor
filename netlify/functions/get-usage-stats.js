// Get usage stats - simplified
export default async (req, context) => {
  return new Response(JSON.stringify({
    callsToday: 0,
    callsThisMonth: 0,
    rateLimitHits: 0
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
