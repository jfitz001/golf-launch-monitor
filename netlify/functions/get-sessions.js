// Get all golf sessions for the current user
import { createClient } from '@supabase/supabase-js';

export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Get user email from request (either query param or body)
    let userEmail;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      userEmail = url.searchParams.get('email');
    } else {
      const body = await req.json();
      userEmail = body.email;
    }

    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
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

    // Get user ID
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !users) {
      // User doesn't exist yet, return empty sessions
      return new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch all sessions for this user
    const { data: sessions, error: sessionsError } = await supabase
      .from('golf_sessions')
      .select('*')
      .eq('user_id', users.id)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return new Response(JSON.stringify({ error: sessionsError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Transform sessions to match localStorage format
    const transformedSessions = (sessions || []).map(s => ({
      id: s.id,
      name: s.club_type || 'Golf Session',
      date: s.created_at,
      timestamp: new Date(s.created_at).getTime(),
      data: s.session_data,
      swingScore: {
        score: s.swing_score,
        description: s.swing_grade
      },
      stats: {
        totalShots: s.shot_count,
        avgCarry: s.avg_carry,
        bestShot: s.best_shot,
        consistency: s.consistency
      }
    }));

    return new Response(JSON.stringify({ 
      sessions: transformedSessions 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
