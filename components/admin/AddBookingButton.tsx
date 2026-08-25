import React from 'react';
import { Plus } from 'lucide-react';

interface AddBookingButtonProps {
  onClick: () => void;
}

export const AddBookingButton: React.FC<AddBookingButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-blue-600"
    >
      <Plus className="w-5 h-5" />
      <span className="font-medium">Добавить новую запись</span>
    </button>
  );
};
