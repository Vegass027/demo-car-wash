import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@/shared/config/chartColors';

interface ServicesBarChartProps {
  carwashCars: number;
  tireCars: number;
}

export const ServicesBarChart: React.FC<ServicesBarChartProps> = ({
  carwashCars,
  tireCars,
}) => {
  const data = [
    { name: 'Автомойка', value: carwashCars, color: CHART_COLORS.carwash },
    { name: 'Шиномонтаж', value: tireCars, color: CHART_COLORS.tire },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="name" 
          tick={{ fontSize: 12 }}
          stroke="#6b7280"
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          stroke="#6b7280"
        />
        <Tooltip 
          cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
          formatter={(value: number) => [`${value} машин`, '']}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <rect key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
