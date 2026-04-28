// Get all users for admin - using REST API
export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const adminEmail = url.searchParams.get('admin');
    
    // Check admin access
    if (adminEmail !== 'jamiefitzgerald001@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
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

    // Fetch all users
    const usersRes = await fetch(`${supabaseUrl}/rest/v1/users?select=*`, { headers });

    if (!usersRes.ok) {
      const errorText = await usersRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const users = await usersRes.json();

    // Transform
    const transformed = (users || []).map(u => ({
      email: u.email,
      role: u.email === 'jamiefitzgerald001@gmail.com' ? 'admin' : 'user',
      lastActive: u.updated_at || u.created_at
    }));

    return new Response(JSON.stringify({ users: transformed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get users error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
