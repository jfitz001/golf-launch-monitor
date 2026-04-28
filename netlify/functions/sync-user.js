// Sync Netlify Identity user to Supabase database - using REST API
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { email, netlify_id } = await req.json();
    
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const projectKey = process.env.PROJECT_KEY;
    const serviceKey = process.env.SERVICE_ROLE_KEY;

    if (!projectKey || !serviceKey) {
      return new Response(JSON.stringify({ 
        error: 'Supabase not configured',
        missing: !projectKey ? 'PROJECT_KEY' : 'SERVICE_ROLE_KEY'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = `https://${projectKey}.supabase.co`;

    // Call RPC function via REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        user_email: email,
        netlify_user_id: netlify_id || null
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase error:', errorText);
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = await response.json();

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: userId 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Sync user error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
