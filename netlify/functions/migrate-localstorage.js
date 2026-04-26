// Migrate localStorage to Supabase - simplified
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
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

  async function getGolfSessionColumns() {
    const sampleRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?select=*&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );
    if (!sampleRes.ok) return new Set();
    const rows = await sampleRes.json();
    if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0] !== 'object') return new Set();
    return new Set(Object.keys(rows[0]));
  }

  function columnExists(columns, column) {
    const legacyColumns = new Set([
      'id',
      'user_id',
      'club_type',
      'shot_count',
      'avg_carry',
      'best_shot',
      'consistency',
      'swing_score',
      'swing_grade',
      'session_data',
      'created_at'
    ]);
    return columns.size === 0 ? legacyColumns.has(column) : columns.has(column);
  }

  function extractRpcUserId(payload) {
    if (!payload) return null;
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload)) return extractRpcUserId(payload[0]);
    if (typeof payload === 'object') {
      return payload.user_id || payload.id || payload.ensure_user_exists || null;
    }
    return null;
  }

  try {
    const body = await req.json();
    const email = body.email || body.userEmail;
    const sessions = body.sessions;

    if (!email || !sessions || !Array.isArray(sessions)) {
      return new Response(JSON.stringify({ error: 'Email and sessions array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure user exists
    const userRes = await fetch(`${supabaseUrl}/rest/v1/rpc/ensure_user_exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ user_email: email, netlify_user_id: null })
    });

    if (!userRes.ok) {
      const userErrorText = await userRes.text();
      return new Response(JSON.stringify({ error: `Failed to ensure user: ${userErrorText}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = extractRpcUserId(await userRes.json());
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id from ensure_user_exists response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let migrated = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];
    let availableColumns = new Set();
    try {
      availableColumns = await getGolfSessionColumns();
    } catch (e) {
      availableColumns = new Set();
    }

    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/golf_sessions?select=*&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );
    const existingSessions = existingRes.ok ? await existingRes.json() : [];
    const fingerprint = (name, shots) => {
      const data = Array.isArray(shots) ? shots : [];
      const first = data[0] || {};
      const last = data[data.length - 1] || {};
      return [
        String(name || '').trim().toLowerCase(),
        data.length,
        first.Date || first.date || '',
        first['Club Speed'] || '',
        first['Carry Distance'] || '',
        last.Date || last.date || '',
        last['Club Speed'] || '',
        last['Carry Distance'] || ''
      ].join('|');
    };
    const existingFingerprints = new Set((Array.isArray(existingSessions) ? existingSessions : []).map((session) => (
      fingerprint(session.session_name || session.club_type, session.shot_data || session.session_data)
    )));

    for (const session of sessions) {
      try {
        const shots = session.data || [];
        const shotCount = shots.length;
        const sessionName = session.name || `Session ${new Date(session.date).toLocaleDateString()}`;
        const sessionFingerprint = fingerprint(sessionName, shots);
        if (existingFingerprints.has(sessionFingerprint)) {
          skipped++;
          continue;
        }
        const avgCarry = shots.reduce((sum, s) => sum + (parseFloat(s['Carry Distance'] || s['Carry Dist.'] || 0)), 0) / shotCount || 0;
        const avgClubSpeed = shots.reduce((sum, s) => sum + (parseFloat(s['Club Speed'] || 0)), 0) / shotCount || 0;

        const payload = {
          user_id: userId,
          shot_count: shotCount
        };
        if (columnExists(availableColumns, 'session_name')) {
          payload.session_name = sessionName;
        } else if (columnExists(availableColumns, 'club_type')) {
          payload.club_type = sessionName;
        }
        if (columnExists(availableColumns, 'shot_data')) {
          payload.shot_data = shots;
        } else if (columnExists(availableColumns, 'session_data')) {
          payload.session_data = shots;
        }
        if (columnExists(availableColumns, 'avg_carry')) {
          payload.avg_carry = Math.round(avgCarry * 10) / 10;
        }
        if (columnExists(availableColumns, 'avg_club_speed')) {
          payload.avg_club_speed = Math.round(avgClubSpeed * 10) / 10;
        }
        if (columnExists(availableColumns, 'best_shot')) {
          const carryDistances = shots.map(s => parseFloat(s['Carry Distance'] || s['Carry Dist.'] || 0)).filter(Number.isFinite);
          payload.best_shot = carryDistances.length ? Math.max(...carryDistances) : null;
        }
        const parsedSessionDate = session.date ? new Date(session.date) : null;
        if (columnExists(availableColumns, 'created_at') && parsedSessionDate && !Number.isNaN(parsedSessionDate.getTime())) {
          payload.created_at = parsedSessionDate.toISOString();
        }

        const insertRes = await fetch(`${supabaseUrl}/rest/v1/golf_sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify(payload)
        });
        if (!insertRes.ok) throw new Error(await insertRes.text());
        existingFingerprints.add(sessionFingerprint);
        migrated++;
      } catch (e) {
        failed++;
        errors.push({
          session: session?.name || 'Unknown session',
          error: e.message
        });
      }
    }

    const results = {
      total: sessions.length,
      successful: migrated,
      migrated,
      skipped,
      failed,
      errors
    };

    return new Response(JSON.stringify({ success: true, migrated, skipped, failed, errors, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
