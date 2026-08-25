import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { CHART_COLORS } from '@/shared/config/chartColors';

interface PaymentPieChartProps {
  cashRevenue: number;
  cardRevenue: number;
  transferRevenue: number;
  formatMoney?: (amount: number) => string;
}

export const PaymentPieChart: React.FC<PaymentPieChartProps> = ({
  cashRevenue,
  cardRevenue,
  transferRevenue,
  formatMoney = (amount) => new Intl.NumberFormat('ru-RU').format(amount),
}) => {
  const data = [
    { name: 'Наличные', value: cashRevenue, color: CHART_COLORS.cash },
    { name: 'Безнал', value: cardRevenue, color: CHART_COLORS.card },
    { name: 'Переводы', value: transferRevenue, color: CHART_COLORS.transfer },
  ].filter(item => item.value > 0);

  if (data.length === 0) {
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
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          fontSize={12}
        >
          {data.map((entry, index) => (
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
