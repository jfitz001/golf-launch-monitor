// Get database statistics
import { createClient } from '@supabase/supabase-js';

export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
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

    // Get total users
    const { count: totalUsers, error: usersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Get total sessions
    const { count: totalSessions, error: sessionsError } = await supabase
      .from('golf_sessions')
      .select('*', { count: 'exact', head: true });

    // Get sessions from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count: sessionsToday, error: todayError } = await supabase
      .from('golf_sessions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    // Get sessions from this month
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const { count: sessionsMonth, error: monthError } = await supabase
      .from('golf_sessions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDayOfMonth.toISOString());

    // Get recent sessions
    const { data: recentSessions, error: recentError } = await supabase
      .from('golf_sessions')
      .select('id, club_type, created_at, shot_count')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get database size (approximate)
    // Note: This requires a custom function in Supabase or admin API access
    // For now, we'll estimate based on session count
    const estimatedSizeKB = (totalSessions || 0) * 50; // Rough estimate: 50KB per session

    return new Response(JSON.stringify({
      success: true,
      stats: {
        totalUsers: totalUsers || 0,
        totalSessions: totalSessions || 0,
        sessionsToday: sessionsToday || 0,
        sessionsMonth: sessionsMonth || 0,
        estimatedSizeMB: (estimatedSizeKB / 1024).toFixed(2),
        recentSessions: recentSessions || [],
        timestamp: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Get database stats error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
