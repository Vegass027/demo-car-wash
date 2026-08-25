import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

// Инициализация Supabase с service_role ключом
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ID пользователей
const ADMIN_ID = 'caffb10b-5c0e-47cb-ade6-140498044aac';
const OWNER_ID = '1f3b6a5d-abab-4e40-a2b0-31a7d3239630';

// Категории расходов
const CATEGORIES = ['tea_coffee', 'repair', 'utilities', 'stationery', 'other'] as const;

// Генерация случайного расхода
function generateExpense(userId: string, date: string) {
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const amount = Math.floor(Math.random() * 5000) + 100; // 100-5100₽

  const comments: Record<string, string[]> = {
    tea_coffee: ['Чай для клиентов', 'Кофе для сотрудников', 'Печенье', 'Сахар'],
    repair: ['Ремонт крана', 'Замена лампочки', 'Ремонт двери', 'Прочее'],
    utilities: ['Свет', 'Вода', 'Отопление', 'Газ'],
    stationery: ['Бумага', 'Ручки', 'Карандаши', 'Папки'],
    other: ['Прочее 1', 'Прочее 2', 'Прочее 3']
  };

  const comment = comments[category][Math.floor(Math.random() * comments[category].length)];

  return {
    category,
    amount,
    comment,
    expense_date: date,
    created_by: userId,
  };
}

async function addExpenses() {
  const dates = ['2025-01-24', '2025-01-25', '2025-01-26'];
  const users = [
    { id: ADMIN_ID, name: 'Admin' },
    { id: OWNER_ID, name: 'Owner' }
  ];

  console.log('📝 Добавление расходов...\n');

  for (const user of users) {
    console.log(`👤 Пользователь: ${user.name} (${user.id})`);

    for (const date of dates) {
      // Добавляем 3-5 расходов на каждую дату
      const count = Math.floor(Math.random() * 3) + 3;

      for (let i = 0; i < count; i++) {
        const expense = generateExpense(user.id, date);

        const { data, error } = await supabase
          .from('expenses')
          .insert(expense)
          .select()
          .single();

        if (error) {
          console.error(`❌ Ошибка добавления расхода:`, error);
        } else {
          console.log(`✅ ${date} - ${expense.category} - ${expense.amount}₽ - ${expense.comment}`);
        }
      }
    }

    console.log('');
  }

  console.log('✅ Готово!');
}

addExpenses().catch(console.error);
