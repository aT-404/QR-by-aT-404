import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('==================================================');
console.log('🔑 EVENT QR SYSTEM — ADMINISTRATOR CREATION TOOL');
console.log('==================================================\n');

if (!supabaseUrl || !supabaseServiceRoleKey || supabaseUrl.includes('your-project-id')) {
  console.error('❌ ERROR: Supabase credentials are not configured.');
  console.error('Please configure the backend/.env file with your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.\n');
  process.exit(1);
}

// Credentials to create
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@event.local';
const ADMIN_PASSWORD = 'AdminSecure2026!'; // Default secure password
const ADMIN_NAME = 'Platform Administrator';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  try {
    // 1. Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', ADMIN_USERNAME)
      .maybeSingle();

    if (existingProfile) {
      console.log(`⚠️ User with username "${ADMIN_USERNAME}" already exists in the profiles table.`);
      console.log('Account is ready. You can log in using these credentials.');
      console.log(`  Username: ${ADMIN_USERNAME}`);
      console.log(`  Password: (The password you set during creation)\n`);
      return;
    }

    console.log(`⏳ Creating auth account for "${ADMIN_EMAIL}"...`);
    
    // 2. Create user in Supabase Auth via Admin client
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, username: ADMIN_USERNAME, role: 'admin' }
    });

    if (authErr) {
      throw new Error(`Auth registration failed: ${authErr.message}`);
    }

    console.log('⏳ Creating database profile mapping...');

    // 3. Create profiles row mapping role = admin
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        name: ADMIN_NAME,
        username: ADMIN_USERNAME,
        role: 'admin',
        status: 'active'
      });

    if (profileErr) {
      // Rollback Auth creation if profile mapping fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Profile mapping failed: ${profileErr.message}`);
    }

    // 4. Create default event settings if not already present
    const { data: existingEvent } = await supabaseAdmin
      .from('event_settings')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();

    if (!existingEvent) {
      console.log('⏳ Seeding default event configuration table...');
      await supabaseAdmin.from('event_settings').insert({
        event_name: 'JUBICON',
        qr_prefix: 'JUBICON',
        starting_number: 1,
        default_max_usage: 3,
        description: 'Welcome to JUBICON Event Entry Portal.',
        venue: 'Main Exhibition Hall',
        event_date: new Date(Date.now() + 86400000 * 7).toISOString(),
        contact_details: 'coordinators@jubicon.local',
        is_active: true
      });
    }

    console.log('\n==================================================');
    console.log('✅ SUCCESS: Administrator account created!');
    console.log('==================================================');
    console.log('You can now log into the web platform:');
    console.log(`  Username: ${ADMIN_USERNAME}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log('==================================================\n');

  } catch (err) {
    console.error('\n❌ ERROR: Failed to create administrator account.');
    console.error(err.message);
    console.error();
    process.exit(1);
  }
}

run();
