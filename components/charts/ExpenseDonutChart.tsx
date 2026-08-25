import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CHART_COLORS } from '@/shared/config/chartColors';

interface Expense {
  category: 'tea' | 'repair' | 'utilities' | 'stationery' | 'other';
  amount: number;
}

interface ExpenseDonutChartProps {
  expenses: Expense[];
  formatMoney?: (amount: number) => string;
}

const categoryLabels: Record<string, string> = {
  tea: 'Чай/Кофе',
  repair: 'Ремонт',
  utilities: 'Коммуналка',
  stationery: 'Канцелярия',
  other: 'Прочее',
};

export const ExpenseDonutChart: React.FC<ExpenseDonutChartProps> = ({
  expenses,
  formatMoney = (amount) => new Intl.NumberFormat('ru-RU').format(amount),
}) => {
  const expensesByCategory = [
    { name: 'Чай/Кофе', value: expenses.filter(e => e.category === 'tea').reduce((sum, e) => sum + e.amount, 0), color: CHART_COLORS.tea },
    { name: 'Ремонт', value: expenses.filter(e => e.category === 'repair').reduce((sum, e) => sum + e.amount, 0), color: CHART_COLORS.repair },
    { name: 'Коммуналка', value: expenses.filter(e => e.category === 'utilities').reduce((sum, e) => sum + e.amount, 0), color: CHART_COLORS.utilities },
    { name: 'Канцелярия', value: expenses.filter(e => e.category === 'stationery').reduce((sum, e) => sum + e.amount, 0), color: CHART_COLORS.stationery },
    { name: 'Прочее', value: expenses.filter(e => e.category === 'other').reduce((sum, e) => sum + e.amount, 0), color: CHART_COLORS.other },
  ].filter(item => item.value > 0);

  if (expensesByCategory.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Нет данных для отображения
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={expensesByCategory}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          fontSize={12}
        >
          {expensesByCategory.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => `${formatMoney(value)}₽`}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          iconType="circle"
          fontSize={12}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};
