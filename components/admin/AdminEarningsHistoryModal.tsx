import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Calendar, DollarSign, Clock } from 'lucide-react';
import { getAdminShiftHistory } from '../../lib/api/admins';

export interface AdminEarningsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminId: string;
  adminName: string;
}

interface WorkShift {
  id: string;
  work_date: string;
  started_at: string;
  finished_at: string | null;
  earnings: number;
  status: string;
}

export const AdminEarningsHistoryModal: React.FC<AdminEarningsHistoryModalProps> = ({
  isOpen,
  onClose,
  adminId,
  adminName,
}) => {
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(false);

  // Загружаем историю смен при открытии модалки
  useEffect(() => {
    const loadShifts = async () => {
      if (!isOpen) return;

      setLoading(true);
      try {
        const data = await getAdminShiftHistory(adminId);
        setShifts(data);
      } catch (error) {
        console.error('Ошибка при загрузке истории смен:', error);
      } finally {
        setLoading(false);
      }
    };

    loadShifts();
  }, [isOpen, adminId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto scroll-mobile">
        <DialogHeader>
          <DialogTitle className="text-lg md:text-xl font-bold">
            История начислений - {adminName}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Загрузка...</div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Нет смен
            </div>
          ) : (
            <div className="space-y-3">
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  {/* Заголовок с датой и суммой */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-sm">
                        {formatDate(shift.work_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <span className="font-bold text-lg text-green-600">
                        {shift.earnings.toLocaleString()} ₽
                      </span>
                    </div>
                  </div>

                  {/* Время начала и конца смены */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Начало: {formatTime(shift.started_at)}</span>
                    </div>
                    {shift.finished_at && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Конец: {formatTime(shift.finished_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Статус смены */}
                  <div className="mt-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        shift.status === 'finished'
                          ? 'bg-green-100 text-green-700'
                          : shift.status === 'working'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {shift.status === 'finished' && 'Завершено'}
                      {shift.status === 'working' && 'В работе'}
                      {shift.status !== 'finished' && shift.status !== 'working' && shift.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Итоговая сумма */}
        {shifts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Всего начислено:</span>
              <span className="font-bold text-xl text-green-600">
                {shifts.reduce((sum, shift) => sum + shift.earnings, 0).toLocaleString()} ₽
              </span>
            </div>
          </div>
        )}

        {/* Кнопка закрытия */}
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
