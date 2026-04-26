// Verify invite - simplified (always valid)
export default async (req, context) => {
  return new Response(JSON.stringify({ valid: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
