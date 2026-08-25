import React from 'react';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Calculator } from 'lucide-react';
import { useLoyaltyProgress } from '../../shared/hooks/useLoyaltyProgress';

interface LoyaltyProgressBarProps {
  profileId: string | null | undefined;
}

export const LoyaltyProgressBar: React.FC<LoyaltyProgressBarProps> = ({ profileId }) => {
  const {
    currentWashes,
    washesUntilFree,
    progressPercentage,
    hasFreeWashAvailable,
    isLoading,
  } = useLoyaltyProgress(profileId);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Calculator className="w-5 h-5" />
          <span>Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="mb-4">
        <Badge className="mb-2 bg-blue-500 hover:bg-blue-600 text-white text-[15px] md:text-[16px] whitespace-normal w-full flex justify-center text-center">
          Получите 10-ю мойку кузова в подарок 🎁
        </Badge>
        <p className="text-sm text-gray-600 mt-2">
          В каждом заказе должны быть услуги «Кузов» и «Салон»
        </p>
      </div>

      {hasFreeWashAvailable ? (
        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 text-center">
          <div className="text-green-700 font-bold text-lg">
            🎉 Бесплатная мойка доступна!
          </div>
        </div>
       ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-sm text-gray-700">
            <span className="font-bold">
              Прогресс: {currentWashes} / 10 моек
            </span>
          </div>

          <div className="mb-2">
            <Progress value={progressPercentage} showPercentage={true} colorClass="bg-green-500" hasBorder={true} />
          </div>
        </>
      )}
    </div>
  );
};
