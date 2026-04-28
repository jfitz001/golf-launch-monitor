// Sync Netlify Identity user to Supabase database
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Initialize Supabase with service role key (has elevated permissions)
    const projectKey = process.env.PROJECT_KEY || context.env?.PROJECT_KEY;
    const supabaseUrl = projectKey ? `https://${projectKey}.supabase.co` : null;
    const supabaseServiceKey = process.env.SERVICE_ROLE_KEY || context.env?.SERVICE_ROLE_KEY;

    console.log('Supabase config check:', {
      hasProjectKey: !!projectKey,
      hasServiceKey: !!supabaseServiceKey,
      url: supabaseUrl
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      const missing = [];
      if (!projectKey) missing.push('PROJECT_KEY');
      if (!supabaseServiceKey) missing.push('SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ 
        error: 'Supabase not configured',
        missing: missing,
        hint: 'Set these in Netlify Environment Variables'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the ensure_user_exists function
    const { data, error } = await supabase.rpc('ensure_user_exists', {
      user_email: email,
      netlify_user_id: netlify_id || null
    });

    if (error) {
      console.error('Error syncing user:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: data 
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
