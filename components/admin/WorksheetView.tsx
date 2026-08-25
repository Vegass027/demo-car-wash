import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ArrowLeft, Calendar, Building2, CarFront, User, Printer, Download, CheckCircle, AlertCircle, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WorksheetEntry } from '../../lib/api/worksheet-entries';
import { formatDate } from '../../shared/utils/date';

export interface WorksheetViewProps {
  organizationId: string;
  organizationName: string;
  onBack: () => void;
}

export const WorksheetView: React.FC<WorksheetViewProps> = ({
  organizationId,
  organizationName,
  onBack
}) => {
  const [entries, setEntries] = useState<WorksheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(formatDate(new Date()));
  const [endDate, setEndDate] = useState(formatDate(new Date()));

  // Загрузка записей ведомости
  React.useEffect(() => {
    const loadEntries = async () => {
      setLoading(true);
      try {
        // TODO: Загрузить записи через API
        // const data = await getWorksheetEntriesByOrganization(organizationId, startDate, endDate);
        setEntries([]);
      } catch (error) {
        console.error('Ошибка при загрузке ведомости:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [organizationId, startDate, endDate]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // TODO: Реализовать экспорт в PDF/Excel
    console.log('Экспорт ведомости');
  };

  return (
    <div className="h-full flex flex-col pb-20 pt-safe telegram-safe-area-top">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="flex-1">
          <h2 className="font-bold text-lg">Ведомость</h2>
          <div className="text-xs text-gray-500">{organizationName}</div>
        </div>
      </div>

      {/* Фильтры по дате */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>С</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>По</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Кнопки действий */}
      <div className="flex gap-2 mb-6">
        <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
          <Printer className="w-4 h-4" />
          Печать
        </Button>
        <Button variant="outline" className="flex-1 gap-2" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Экспорт
        </Button>
      </div>

      {/* Список записей */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {loading ? (
          <div className="text-center text-gray-500 py-8">
            Загрузка...
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            Нет записей за выбранный период
          </div>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Заголовок записи */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">{formatDate(entry.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">{entry.organization_name}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-sm uppercase">
                      {entry.total_price} ₽
                    </Badge>
                  </div>

                  {/* Информация о заказе */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span>{entry.driver_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CarFront className="w-4 h-4 text-gray-500" />
                      <span>{entry.car_model}</span>
                    </div>
                  </div>

                  {/* Список услуг */}
                  {entry.services && entry.services.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-gray-500 mb-2">Услуги</div>
                      <div className="space-y-1">
                        {entry.services.map((service, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="flex-1">{service.name}</span>
                            <span className="text-gray-500">{service.price} ₽</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Подпись */}
                  <div className="pt-2 border-t">
                    <div className="text-xs text-gray-500 mb-2">Подпись водителя</div>
                    {entry.signature_data ? (
                      <div className="flex items-center gap-3">
                        <div className="border-2 border-gray-200 rounded-lg p-2 bg-white flex-1">
                          <img
                            src={entry.signature_data}
                            alt="Подпись"
                            className="h-10 w-auto"
                          />
                        </div>
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-orange-600 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        Подпись отсутствует
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
