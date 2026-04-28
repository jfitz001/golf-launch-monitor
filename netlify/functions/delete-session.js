// Delete a golf session from Supabase database
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async (req, context) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
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

    // Initialize Supabase with service role key
    const supabaseUrl = process.env.SUPABASE_URL || context.env?.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || context.env?.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID to verify ownership
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !users) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete session (RLS will ensure user can only delete their own sessions)
    const { error: deleteError } = await supabase
      .from('golf_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', users.id);

    if (deleteError) {
      console.error('Error deleting session:', deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Session deleted successfully'
    }), {
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
