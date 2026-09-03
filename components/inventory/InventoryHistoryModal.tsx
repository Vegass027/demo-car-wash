/**
 * Модальное окно истории прихода товара
 */

import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Package, Banknote, X, Download, Clock, Eye, AlertCircle, Loader2 } from 'lucide-react';
import { InventoryArrivalHistory } from '@/entities/inventory/model';
import { getInventoryArrivalPhotoUrls } from '@/lib/api/inventory';

interface InventoryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: InventoryArrivalHistory[];
  itemName: string;
}

type DateFilter = 'all' | 'today' | 'week' | 'month';

export const InventoryHistoryModal: React.FC<InventoryHistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  itemName,
}) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Сброс state при открытии
  useEffect(() => {
    if (isOpen) {
      setDateFilter('all');
      setSelectedPhoto(null);

      // Блокируем скролл body
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        // Восстанавливаем при закрытии
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Фильтрация истории по дате поставки
  const filteredHistory = React.useMemo(() => {
    if (dateFilter === 'all') return history;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // За неделю: 7 дней назад от начала текущего дня
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    // За месяц: 30 дней назад от начала текущего дня
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return history.filter(item => {
      // Используем deliveryDate если есть, иначе createdAt
      const itemDate = new Date(item.deliveryDate || item.createdAt);

      switch (dateFilter) {
        case 'today':
          return itemDate >= today;
        case 'week':
          return itemDate >= weekAgo;
        case 'month':
          return itemDate >= monthAgo;
        default:
          return true;
      }
    });
  }, [history, dateFilter]);

  // Сортировка по дате поставки (новые сверху)
  const sortedHistory = React.useMemo(() => {
    return [...filteredHistory].sort((a, b) => {
      const dateA = new Date(a.deliveryDate || a.createdAt);
      const dateB = new Date(b.deliveryDate || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredHistory]);

  const handleClosePhotoModal = () => {
    setSelectedPhoto(null);
  };

  return (
    <>
      <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <div className="fixed inset-0 z-[51] flex items-center justify-center p-4">
            <DialogPrimitive.Content
              aria-describedby="dialog-description"
              style={{
                width: '100%',
                maxWidth: '42rem',
                maxHeight: '85vh',
                overflowY: 'auto',
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              {/* Кнопка закрытия в правом верхнем углу */}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-1 rounded-sm opacity-70 hover:opacity-100 cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <span id="dialog-description" className="sr-only">
                История прихода товара
              </span>
              <DialogHeader>
                <div className="flex items-center gap-2 min-w-0 mb-4 pr-8">
                  <DialogTitle className="text-base">История прихода</DialogTitle>
                  <span className="text-gray-400 shrink-0">|</span>
                  <span className="text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{itemName}</span>
                </div>

                {/* Radix UI Select для фильтрации по периодам */}
                <Select value={dateFilter} onValueChange={(value) => setDateFilter(value as DateFilter)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите период" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]" position="popper">
                    <SelectItem value="all">Все записи</SelectItem>
                    <SelectItem value="today">Сегодня</SelectItem>
                    <SelectItem value="week">За неделю</SelectItem>
                    <SelectItem value="month">За месяц</SelectItem>
                  </SelectContent>
                </Select>
              </DialogHeader>

              {/* Список истории */}
              <div className="mt-4">
                {sortedHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    Нет записей за выбранный период
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedHistory.map((item) => (
                      <HistoryCard key={item.id} historyItem={item} onOpenPhoto={setSelectedPhoto} itemName={itemName} />
                    ))}
                  </div>
                )}
              </div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Модальное окно просмотра фото */}
      {selectedPhoto && (
        <DialogPrimitive.Root open={!!selectedPhoto} onOpenChange={(open) => !open && handleClosePhotoModal()}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[52] bg-black/50" />
            <div className="fixed inset-0 z-[53] flex items-center justify-center p-4">
              <DialogPrimitive.Content
                style={{
                  width: '100%',
                  maxWidth: '56rem',
                  maxHeight: '90vh',
                  padding: 0,
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                  borderRadius: '0.5rem',
                  zIndex: 53,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={handleClosePhotoModal}
                  className="absolute top-4 right-4 z-[54] p-3 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors shadow-lg cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-6 h-6" strokeWidth={2.5} />
                </button>
                <div className="w-full h-full flex items-center justify-center bg-black/90 p-4">
                  <img
                    src={selectedPhoto}
                    alt="Фото накладной"
                    className="max-w-full max-h-[80vh] object-contain"
                  />
                </div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  );
};

interface HistoryCardProps {
  historyItem: InventoryArrivalHistory;
  onOpenPhoto: (photo: string) => void;
  itemName: string;
}

const HistoryCard: React.FC<HistoryCardProps> = ({ historyItem, onOpenPhoto, itemName }) => {
  const formatDate = (date: Date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  // Issue 9 Variant B: historyItem.photos are storage PATHS (not URLs).
  // Fetch fresh signed URLs on mount via the dispatcher. Three states:
  //   loading — initial fetch in flight
  //   has_url — at least one URL is signed and usable for <img>
  //   no_photo — either photos[] empty or all signing attempts failed
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!historyItem.photos || historyItem.photos.length === 0) {
      setPhotoUrl(null);
      return;
    }
    setPhotoLoading(true);
    getInventoryArrivalPhotoUrls(historyItem.id)
      .then((urls) => { if (!cancelled) setPhotoUrl(urls[0] ?? null); })
      .catch(() => { if (!cancelled) setPhotoUrl(null); })
      .finally(() => { if (!cancelled) setPhotoLoading(false); });
    return () => { cancelled = true; };
  }, [historyItem.id, historyItem.photos]);

  const handleDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `накладная.${itemName}.${formatDate(historyItem.createdAt)}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="border-l-4 border-l-green-500">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Двухколоночный макет с разделителем */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
            {/* Левая колонка */}
            <div className="space-y-3">
              {/* Добавлено */}
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div className="text-xs text-gray-500">Добавлено:</div>
                </div>
                <div className="text-sm font-semibold ml-6">{formatDate(historyItem.createdAt)}</div>
                <div className="flex items-center gap-2 ml-6 mt-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <div className="text-sm text-gray-600">{formatTime(historyItem.createdAt)}</div>
                </div>
              </div>

              {/* Дата поставки */}
              {historyItem.deliveryDate && (
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-gray-500">Дата поставки</div>
                    <div className="text-sm font-semibold">{formatDate(historyItem.deliveryDate)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Разделитель */}
            <div className="border-l border-gray-200"></div>

            {/* Правая колонка */}
            <div className="space-y-3">
              {/* Цена за единицу */}
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-gray-500">Цена за ед.</div>
                  <div className="text-sm font-semibold">{historyItem.pricePerUnit.toFixed(2)} ₽</div>
                </div>
              </div>

              {/* Количество */}
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-gray-500">Количество:</div>
                  <div className="text-sm font-semibold">
                    {historyItem.quantity % 1 === 0 ? historyItem.quantity : historyItem.quantity.toFixed(2).replace(/\.?0+$/, '')}
                  </div>
                </div>
              </div>

              {/* Чек — Issue 9 V-B: photos[] holds storage paths; need to fetch
                  fresh signed URL via dispatcher before showing buttons. */}
              {historyItem.photos && historyItem.photos.length > 0 ? (
                photoLoading ? (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Загрузка чека…
                  </div>
                ) : photoUrl ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs"
                      onClick={() => onOpenPhoto(photoUrl)}
                    >
                      <Eye className="w-3 h-3" />
                      Чек
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs"
                      onClick={() => handleDownload(photoUrl)}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <AlertCircle className="w-3 h-3" />
                    Не удалось получить ссылку
                  </div>
                )
              ) : (
                <div className="flex items-center gap-1 text-xs text-orange-600">
                  <AlertCircle className="w-3 h-3" />
                  Нет чека
                </div>
              )}
            </div>
          </div>

          {/* Общая сумма */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold">Итого:</span>
            </div>
            <Badge variant="outline" className="text-lg font-bold">
              {historyItem.totalPrice} ₽
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
