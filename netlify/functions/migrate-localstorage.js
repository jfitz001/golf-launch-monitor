// One-time migration from localStorage to Supabase
import { createClient } from '@supabase/supabase-js';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { sessions, userEmail } = await req.json();
    
    if (!sessions || !Array.isArray(sessions) || !userEmail) {
      return new Response(JSON.stringify({ error: 'Sessions array and email required' }), {
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

    // Ensure user exists
    const { data: userId, error: userError } = await supabase.rpc('ensure_user_exists', {
      user_email: userEmail,
      netlify_user_id: null
    });

    if (userError) {
      console.error('Error ensuring user exists:', userError);
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Migrate each session
    const results = {
      total: sessions.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const session of sessions) {
      try {
        // Calculate stats
        const carryDistances = session.data.map(s => parseFloat(s['Carry Distance']) || 0).filter(d => d > 0);
        const avgCarry = carryDistances.length > 0 ? carryDistances.reduce((a,b) => a+b, 0) / carryDistances.length : 0;
        const bestShot = carryDistances.length > 0 ? Math.max(...carryDistances) : 0;
        const stdDev = carryDistances.length > 1 ? Math.sqrt(carryDistances.map(x => Math.pow(x - avgCarry, 2)).reduce((a, b) => a + b) / carryDistances.length) : 0;
        const consistency = avgCarry > 0 ? Math.max(0, 100 - (stdDev / avgCarry * 100)) : 0;

        // Insert session
        const { error: insertError } = await supabase
          .from('golf_sessions')
          .insert({
            user_id: userId,
            club_type: session.name || 'Golf Session',
            shot_count: session.data.length,
            avg_carry: avgCarry.toFixed(2),
            best_shot: bestShot.toFixed(2),
            consistency: consistency.toFixed(2),
            swing_score: session.swingScore?.score || Math.round(consistency),
            swing_grade: session.swingScore?.description || 'Good',
            session_data: session.data,
            created_at: session.date || new Date(session.timestamp || Date.now()).toISOString()
          });

        if (insertError) {
          results.failed++;
          results.errors.push({
            session: session.name,
            error: insertError.message
          });
        } else {
          results.successful++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          session: session.name || 'Unknown',
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
