// Get users for admin - simplified
export default async (req, context) => {
  const projectKey = process.env.PROJECT_KEY;
  const serviceKey = process.env.SERVICE_ROLE_KEY;

  if (!projectKey || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = `https://${projectKey}.supabase.co`;

  try {
    const usersRes = await fetch(
      `${supabaseUrl}/rest/v1/users?select=*&order=created_at.desc`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    const users = await usersRes.json();

    return new Response(JSON.stringify(users), {
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
