// Check rate limit - simplified (always allows)
export default async (req, context) => {
  return new Response(JSON.stringify({ allowed: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
