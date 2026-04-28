// Get all users from Supabase
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Get admin email from query or body
    let adminEmail;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      adminEmail = url.searchParams.get('admin');
    } else {
      const body = await req.json();
      adminEmail = body.admin;
    }

    // Verify admin access
    if (adminEmail !== 'jamiefitzgerald001@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase with service role key
    const projectKey = process.env.PROJECT_KEY || context.env?.PROJECT_KEY;
    const supabaseUrl = projectKey ? `https://${projectKey}.supabase.co` : null;
    const supabaseServiceKey = process.env.SERVICE_ROLE_KEY || context.env?.SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all users from Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users from Supabase:', error);
      return new Response(JSON.stringify({ 
        error: error.message,
        users: [],
        total: 0
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Transform users to admin format
    const transformedUsers = (users || []).map(user => ({
      id: user.id,
      email: user.email,
      role: user.email === 'jamiefitzgerald001@gmail.com' ? 'admin' : 'user',
      lastActive: user.updated_at || user.created_at,
      created_at: user.created_at
    }));

    return new Response(JSON.stringify({
      users: transformedUsers,
      total: transformedUsers.length
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Error in get-users function:', error);
    
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
