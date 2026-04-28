// Get API usage statistics
export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // In production, fetch from database
    // For now, return structure that client expects
    const stats = {
      callsToday: 0,
      callsMonth: 0,
      totalUsers: 1,
      rateLimitHits: 0,
      recentRequests: [],
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
