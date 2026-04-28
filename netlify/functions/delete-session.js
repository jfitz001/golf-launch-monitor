// Delete golf session - using REST API
export default async (req, context) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { sessionId, userEmail } = await req.json();
    
    if (!sessionId || !userEmail) {
      return new Response(JSON.stringify({ error: 'Session ID and email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const projectKey = process.env.PROJECT_KEY;
    const serviceKey = process.env.SERVICE_ROLE_KEY;

    if (!projectKey || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = `https://${projectKey}.supabase.co`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    };

    // Delete session
    const deleteRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?id=eq.${sessionId}`,
      { method: 'DELETE', headers }
    );

    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete session error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
