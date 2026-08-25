import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import { Lock, X } from "lucide-react";

interface PinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
}

export const PinCodeModal: React.FC<PinCodeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = "Enter PIN Code",
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setError(false);
    }
  }, [isOpen]);

  const handleNumClick = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        // Validate PIN (Mocking check: '0000')
        if (newPin === "0000") {
           // Simulate slight delay for effect
           setTimeout(() => {
             onSuccess();
           }, 200);
        } else {
          setError(true);
          // Haptic feedback simulation would go here
          setTimeout(() => {
            setPin("");
            setError(false);
          }, 500);
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={cn(
        "bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl p-6 shadow-xl transform transition-all",
        error ? "animate-shake" : ""
      )}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            {title}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-colors duration-200",
                pin.length > i
                  ? error ? "bg-red-500 border-red-500" : "bg-primary border-primary"
                  : "border-gray-300"
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumClick(num.toString())}
              className="h-16 text-2xl font-medium rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleNumClick("0")}
            className="h-16 text-2xl font-medium rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            0
          </button>
          <button
             onClick={() => setPin(pin.slice(0, -1))}
             className="h-16 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500"
          >
            ⌫
          </button>
        </div>
      </div>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};
