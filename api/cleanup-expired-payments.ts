import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Конфигурация для Vercel Serverless Functions
export const config = {
  maxDuration: 60, // максимальное время выполнения в секундах
};

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
    console.log('[CLEANUP-EXPIRED-PAYMENTS] Starting cleanup...');

    const now = new Date().toISOString();

    // ШАГ 1: Удаляем истекшие pending_bookings
    const { data: expiredPendingBookings, error: pendingError } = await supabase
      .from('pending_bookings')
      .delete()
      .lt('expires_at', now)
      .select('id');

    if (pendingError) {
      console.error('[CLEANUP-EXPIRED-PAYMENTS] Delete pending_bookings error:', pendingError);
      throw pendingError;
    }

    const deletedPendingCount = expiredPendingBookings?.length || 0;
    console.log(`[CLEANUP-EXPIRED-PAYMENTS] Deleted ${deletedPendingCount} expired pending_bookings`);

    // Платежи со статусом "pending" и истекшим pending_booking_id
    // НЕ отменяются, потому что СБП использует capture: true
    // Платежи с capture: true нельзя отменять через API /cancel
    // YooKassa может автоматически списать деньги позже (редкость)
    // pending_bookings удалены - слоты освобождены - этого достаточно

    return res.status(200).json({
      success: true,
      deleted_pending_bookings: deletedPendingCount,
      cleaned_at: now,
    });

  } catch (error: any) {
    console.error('[CLEANUP-EXPIRED-PAYMENTS] Error:', error);
    return res.status(500).json({ 
      error: 'Cleanup failed',
      details: error.message 
    });
  }
}
