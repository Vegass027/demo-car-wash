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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pending_booking_id } = req.body;

    if (!pending_booking_id) {
      return res.status(400).json({ error: 'pending_booking_id is required' });
    }

    console.log('[CHECK-PAYMENT-STATUS] Checking payment status for pending_booking_id:', pending_booking_id);

    // Получаем платеж по pending_booking_id
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, status, booking_id, tire_booking_id, pending_booking_id')
      .eq('pending_booking_id', pending_booking_id)
      .single();

    if (paymentError) {
      console.error('[CHECK-PAYMENT-STATUS] Payment not found:', paymentError);
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log('[CHECK-PAYMENT-STATUS] Payment found:', {
      id: payment.id,
      status: payment.status,
      booking_id: payment.booking_id,
      tire_booking_id: payment.tire_booking_id,
      pending_booking_id: payment.pending_booking_id,
    });

    // Проверяем, истекло ли время ожидания
    const { data: pendingBooking, error: pendingError } = await supabase
      .from('pending_bookings')
      .select('expires_at')
      .eq('id', pending_booking_id)
      .single();

    if (!pendingError && pendingBooking) {
      const now = new Date();
      const expiresAt = new Date(pendingBooking.expires_at);

      if (now > expiresAt) {
        console.log('[CHECK-PAYMENT-STATUS] Payment expired');
        return res.status(200).json({
          status: 'expired',
          message: 'Payment expired',
        });
      }
    }

    // Возвращаем статус платежа
    return res.status(200).json({
      status: payment.status,
      message: payment.status === 'succeeded' ? 'Payment succeeded' : 'Payment pending',
    });

  } catch (error: any) {
    console.error('[CHECK-PAYMENT-STATUS] Error:', error);
    return res.status(500).json({
      error: 'Failed to check payment status',
      details: error.message,
    });
  }
}
