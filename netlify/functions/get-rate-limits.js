// Get rate limits - simplified
export default async (req, context) => {
  return new Response(JSON.stringify({
    perMinute: 10,
    perHour: 100,
    perDay: 500
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
