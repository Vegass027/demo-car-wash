/**
 * Generates a valid Telegram initData string with HMAC signature for our test bot.
 * Run with: node --env-file=.env.local test-generate-initdata.mjs <telegram_id>
 *
 * Output: a curl command you can paste to test /api/telegram-auth.
 */

import crypto from 'crypto';

const BOT_TOKEN = '8968802010:AAFsPlpWkW-GQWmJjSP25MKLU0jCooE7hdM';
const telegramId = process.argv[2] ? parseInt(process.argv[2]) : 111111111;

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const authDate = Math.floor(Date.now() / 1000);
const user = JSON.stringify({
  id: telegramId,
  first_name: 'Test',
  last_name: 'Owner',
  username: 'test_user_' + telegramId,
  language_code: 'ru',
});

const params = new URLSearchParams({
  user: user,
  auth_date: String(authDate),
  query_id: 'AAGz5KBlAAA',
});

// Build data_check_string (sorted key=value pairs joined by \n, hash excluded)
const dataCheckString = Array.from(params.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');

// Compute HMAC-SHA256 per Telegram spec
//   secret_key = HMAC-SHA256(bot_token, "WebAppData")
//   hash       = HMAC-SHA256(secret_key, data_check_string)
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

const allParams = new URLSearchParams(params);
allParams.set('hash', hash);
const initData = allParams.toString();

console.log('=== initData (paste into curl command below) ===');
console.log(initData);
console.log('');
console.log('=== curl command ===');
console.log(`curl -s -X POST https://demo-car-wash.vercel.app/api/telegram-auth \\
  -H "Content-Type: application/json" \\
  -d @- <<'EOF'`);
console.log(JSON.stringify({ initData }, null, 2));
console.log('EOF');
console.log('');
console.log('=== Expected: 200 with token, profile_id, app_role ===');
console.log('Profile lookup by telegram_id=' + telegramId);
console.log('Check existing profiles: PGPASSWORD="YVJlmcibmLQYBtRM" psql "postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" -c "SELECT id, role, telegram_id FROM profiles WHERE telegram_id=' + telegramId + ';"');