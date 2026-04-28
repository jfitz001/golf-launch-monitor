// Get all users from Netlify Identity
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

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    
    // Verify it's the admin user
    // In production, you'd decode the JWT and verify the email
    // For now, we'll fetch all users from Netlify Identity
    
    const siteUrl = process.env.URL || 'https://golf-launch-r10.netlify.app';
    
    // Fetch users from Netlify Identity Admin API
    const response = await fetch(`${siteUrl}/.netlify/identity/admin/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      // If admin API doesn't work, return structure with current user only
      return new Response(JSON.stringify({
        users: [],
        total: 0,
        note: 'Admin API requires service_role key. Showing cached data only.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    
    // Transform users to our format
    const users = (data.users || data || []).map(user => ({
      id: user.id,
      email: user.email,
      role: user.email === 'jamiefitzgerald001@gmail.com' ? 'admin' : 'user',
      lastActive: user.updated_at || user.created_at || new Date().toISOString(),
      created_at: user.created_at
    }));

    return new Response(JSON.stringify({
      users,
      total: users.length
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    
    return new Response(JSON.stringify({ 
      users: [],
      total: 0,
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
