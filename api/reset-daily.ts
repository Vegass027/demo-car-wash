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
  const startTime = new Date();
  console.log(`[RESET-DAILY] Cron job started at: ${startTime.toISOString()}`);

  // Проверка авторизации
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[RESET-DAILY] Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    console.error(`[RESET-DAILY] Method not allowed: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ШАГ 1: Сброс дня и начисление зарплат
    console.log('[RESET-DAILY] Step 1: Starting daily reset...');
    
    const { data: resetData, error: resetError } = await supabase.rpc('reset_daily', {});

    if (resetError) {
      console.error('[RESET-DAILY] RPC error:', resetError);
      throw resetError;
    }

    console.log('[RESET-DAILY] Step 1: Reset completed successfully', JSON.stringify(resetData));

    // ШАГ 2: Генерация отчета за ТЕКУЩИЙ день
    const today = new Date();
    const reportDate = today.toISOString().split('T')[0]; // Формат: 'YYYY-MM-DD'

    console.log(`[RESET-DAILY] Step 2: Generating report for date: ${reportDate}`);

    const { data: reportData, error: reportError } = await supabase.rpc('save_daily_report', {
      target_date: reportDate
    });

    if (reportError) {
      // НЕ бросаем ошибку! Логируем и продолжаем
      console.error('[RESET-DAILY] Step 2: Failed to save report:', reportError);
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log(`[RESET-DAILY] Cron job completed with errors at: ${endTime.toISOString()}, duration: ${duration}ms`);
      
      return res.status(200).json({
        reset: resetData,
        report: {
          success: false,
          error: reportError.message,
          date: reportDate
        }
      });
    }

    console.log('[RESET-DAILY] Step 2: Report saved successfully', JSON.stringify(reportData));

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`[RESET-DAILY] Cron job completed successfully at: ${endTime.toISOString()}, duration: ${duration}ms`);

    // Возвращаем результаты обеих операций
    return res.status(200).json({
      reset: resetData,
      report: {
        success: true,
        date: reportDate,
        data: reportData
      },
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`
    });

  } catch (error: any) {
    console.error('[RESET-DAILY] Critical error:', error);
    
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`[RESET-DAILY] Cron job failed at: ${endTime.toISOString()}, duration: ${duration}ms`);
    
    return res.status(500).json({ 
      error: 'Reset failed',
      details: error.message 
    });
  }
}
