// auth.js — Login/OTP/session management

async function sendOTP(phone) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
  if (error) throw error;
}

async function verifyOTP(phone, token) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: `+91${phone}`,
    token,
    type: 'sms',
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  app.set('user', null);
  app.set('session', null);
  app.set('adminUser', null);
  navigate('/login');
}

async function fetchUserProfile(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchAdminUser(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

function requireAuth() {
  const session = app.get('session');
  if (!session) {
    navigate('/login');
    return false;
  }
  return true;
}

function requireAdmin() {
  const adminUser = app.get('adminUser');
  if (!adminUser) {
    navigate('/login');
    return false;
  }
  return true;
}
