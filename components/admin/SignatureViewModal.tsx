import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

export interface SignatureViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  signatureData: string | null;
  driverName?: string;
}

export const SignatureViewModal: React.FC<SignatureViewModalProps> = ({
  isOpen,
  onClose,
  signatureData,
  driverName
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Подпись водителя</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {driverName && (
            <div className="text-sm text-gray-600">
              {driverName}
            </div>
          )}
          {signatureData ? (
            <div className="border-2 border-gray-200 rounded-lg p-4 bg-white">
              <img
                src={signatureData}
                alt="Подпись"
                className="w-full h-auto"
              />
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Подпись не установлена
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
