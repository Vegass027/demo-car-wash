import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pen, Trash2, Check } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureBase64: string) => Promise<void>;
  existingSignature?: string | null;
  driverName: string;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingSignature,
  driverName,
}) => {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 256 });

  // Пересчет размеров canvas при изменении размера окна
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = 256;
        setCanvasSize({ width, height });
      }
    };

    if (isOpen) {
      // Задержка для завершения анимации открытия
      setTimeout(updateCanvasSize, 150);
      window.addEventListener('resize', updateCanvasSize);
      window.addEventListener('orientationchange', updateCanvasSize);
    }

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      window.removeEventListener('orientationchange', updateCanvasSize);
    };
  }, [isOpen]);

  // Загрузка существующей подписи при открытии модального окна
  useEffect(() => {
    if (isOpen && sigCanvas.current && canvasSize.width > 0) {
      setTimeout(() => {
        sigCanvas.current?.clear();
        if (existingSignature) {
          sigCanvas.current?.fromDataURL(existingSignature);
        }
      }, 200);
    }
  }, [isOpen, existingSignature, canvasSize]);

  const handleClear = () => {
    sigCanvas.current?.clear();
    setHasSignature(false);
    setShowExisting(false);
  };

  const handleSave = async () => {
    if (!hasSignature && !existingSignature) return;

    setIsSaving(true);
    try {
      let signatureData = existingSignature;

      if (hasSignature && sigCanvas.current) {
        signatureData = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
      }

      await onSave(signatureData);
      onClose();
      handleClear();
    } catch (error) {
      console.error('Ошибка сохранения подписи:', error);
      alert('Не удалось сохранить подпись');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setHasSignature(true);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pen className="w-5 h-5" />
            Цифровая подпись
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Водитель: <span className="font-medium">{driverName}</span>
          </div>

          {existingSignature && !hasSignature && !showExisting && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600">Текущая подпись:</div>
              <div className="border rounded-lg p-4 bg-gray-50">
                <img
                  src={existingSignature}
                  alt="Текущая подпись"
                  className="h-24 mx-auto"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (existingSignature) {
                      onSave(existingSignature);
                      onClose();
                    }
                  }}
                  className="flex-1"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Оставить текущую
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExisting(true)}
                  className="flex-1"
                >
                  <Pen className="w-4 h-4 mr-2" />
                  Создать новую
                </Button>
              </div>
            </div>
          )}

          {(!existingSignature || hasSignature || showExisting) && (
            <div className="space-y-2">
              <div className="text-sm text-gray-600">
                Нарисуйте подпись в поле ниже:
              </div>
              <div
                ref={containerRef}
                className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden"
                style={{
                  touchAction: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none'
                }}
              >
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    width: canvasSize.width,
                    height: canvasSize.height,
                    className: 'w-full h-full cursor-crosshair',
                    style: {
                      touchAction: 'none',
                      backgroundColor: '#fff',
                      display: 'block',
                      width: '100%',
                      height: canvasSize.height + 'px'
                    }
                  }}
                  penColor="#000"
                  minWidth={1.5}
                  maxWidth={2.5}
                  velocityFilterWeight={0.7}
                  onEnd={handleEnd}
                  throttle={16}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={!hasSignature}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Очистить
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasSignature && !existingSignature}
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
