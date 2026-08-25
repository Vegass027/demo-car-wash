import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from '@/shared/config/chartColors';

interface FinancialWaterfallChartProps {
  totalRevenue: number;
  totalExpenses: number;
  totalWorkersSalary: number;
  totalTechniciansSalary: number;
  adminBaseSalary: number;
  netProfit: number;
  formatMoney?: (amount: number) => string;
}

export const FinancialWaterfallChart: React.FC<FinancialWaterfallChartProps> = ({
  totalRevenue,
  totalExpenses,
  totalWorkersSalary,
  totalTechniciansSalary,
  adminBaseSalary,
  netProfit,
  formatMoney = (amount) => new Intl.NumberFormat('ru-RU').format(amount),
}) => {
  const totalSalaryExpenses = totalWorkersSalary + totalTechniciansSalary + adminBaseSalary;
  const totalAllExpenses = totalExpenses + totalSalaryExpenses;

  const data = [
    { name: 'Выручка', value: totalRevenue, type: 'income' },
    { name: 'Расходы', value: -totalExpenses, type: 'expense' },
    { name: 'Зарплаты', value: -totalSalaryExpenses, type: 'expense' },
    { name: 'Прибыль', value: netProfit, type: 'result' },
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 80, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          type="number" 
          tick={{ fontSize: 12 }}
          stroke="#6b7280"
          tickFormatter={(value) => `${formatMoney(Math.abs(value))}₽`}
        />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={80}
          tick={{ fontSize: 12 }}
          stroke="#6b7280"
        />
        <Tooltip 
          formatter={(value: number) => `${formatMoney(Math.abs(value))}₽`}
          cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
        />
        <Legend 
          verticalAlign="bottom" 
          height={36}
          iconType="circle"
          fontSize={12}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <rect 
              key={`cell-${index}`} 
              fill={
                entry.type === 'income' ? CHART_COLORS.income :
                entry.type === 'expense' ? CHART_COLORS.expense :
                entry.value >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss
              } 
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
