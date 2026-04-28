// Supabase Client - Initialize once and reuse across the app
// This uses the public anon key which is safe for frontend use

let supabaseClient = null;

// Initialize Supabase client
function initializeSupabase() {
    if (supabaseClient) return supabaseClient;
    
    // Get credentials from environment (injected at build time)
    // For local development, these would need to be in a .env file
    const SUPABASE_URL = 'https://obwrjgmbyoznntlofqyk.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9id3JqZ21ieW96bm50bG9mcXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzA3NTIsImV4cCI6MjA5MjkwNjc1Mn0.G4cq0dpPR2NTqYz1q-F0GdjvoqaBVo4HXfpA5IFxAn8';
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Supabase credentials not configured');
        return null;
    }
    
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: false, // We'll use Netlify Identity for auth
            detectSessionInUrl: false
        }
    });
    
    console.log('Supabase client initialized');
    return supabaseClient;
}

// Get the Supabase client (initializes if needed)
function getSupabaseClient() {
    return initializeSupabase();
}

// Export for use in other files
window.getSupabaseClient = getSupabaseClient;
window.initializeSupabase = initializeSupabase;
