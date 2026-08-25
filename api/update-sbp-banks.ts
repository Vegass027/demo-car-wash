import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Конфигурация для Vercel Serverless Functions
export const config = {
  maxDuration: 30, // максимальное время выполнения в секундах
};

// Функция получения банков из YooKassa (инлайн для избежания проблем с импортом)
async function getSBPBanks(): Promise<any[]> {
  console.log('[YOOKASSA] Getting SBP banks list');

  const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
  const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID!;
  const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY!;

  const auth = `${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`;

  console.log('[YOOKASSA] Using Shop ID for authentication:', YOOKASSA_SHOP_ID);

  const response = await fetch(`${YOOKASSA_API_URL}/sbp_banks`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(auth).toString('base64')}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[YOOKASSA] Get banks error:', error);
    throw new Error(`YooKassa API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const banks = data.items || []; // YooKassa returns { items: [...] }

  console.log('[YOOKASSA] Got banks list:', banks.length);
  return banks;
}

export default async function handler(req: any, res: any) {
  // Проверка авторизации (CRON_SECRET)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[UPDATE-SBP-BANKS] Starting update...');

    // ШАГ 1: Получаем список банков из YooKassa
    const banks = await getSBPBanks();

    if (!banks || banks.length === 0) {
      console.error('[UPDATE-SBP-BANKS] No banks received from YooKassa');
      return res.status(500).json({ error: 'No banks received from YooKassa' });
    }

    // ШАГ 2: Удаляем старые банки
    const { error: deleteError } = await supabase
      .from('sbp_banks')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Всегда ложное условие для удаления всех

    if (deleteError) {
      console.error('[UPDATE-SBP-BANKS] Delete error:', deleteError);
      throw deleteError;
    }

    console.log('[UPDATE-SBP-BANKS] Deleted old banks');

    // ШАГ 3: Подготавливаем данные для вставки
    const banksToInsert = banks.map((bank: any) => ({
      id: bank.id,
      name: bank.name,
      code: bank.code || bank.bic || '',
      logo: bank.logo || '',
      deep_link: bank.deepLink || '',
    }));

    // ШАГ 4: Вставляем новые банки
    const { error: insertError } = await supabase
      .from('sbp_banks')
      .insert(banksToInsert);

    if (insertError) {
      console.error('[UPDATE-SBP-BANKS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[UPDATE-SBP-BANKS] Updated ${banksToInsert.length} banks`);

    return res.status(200).json({
      success: true,
      count: banksToInsert.length,
      updated_at: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[UPDATE-SBP-BANKS] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to update banks',
      details: error.message 
    });
  }
}
