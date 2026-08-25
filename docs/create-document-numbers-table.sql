-- Таблица для хранения номеров документов (счета, акты)
-- Используется для автонумерации документов

CREATE TABLE IF NOT EXISTS public.document_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'act')), -- Валидация
  current_number INTEGER NOT NULL DEFAULT 0 CHECK (current_number >= 0), -- Не может быть отрицательным
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уникальный индекс для типа документа
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_numbers_type ON public.document_numbers(document_type);

-- Комментарии
COMMENT ON TABLE public.document_numbers IS 'Номера документов для автонумерации (счета, акты)';
COMMENT ON COLUMN public.document_numbers.document_type IS 'Тип документа: invoice (счет) или act (акт)';
COMMENT ON COLUMN public.document_numbers.current_number IS 'Текущий номер документа';

-- Вставляем начальные значения
INSERT INTO public.document_numbers (document_type, current_number)
VALUES
  ('invoice', 0),
  ('act', 0)
ON CONFLICT (document_type) DO NOTHING;

-- Функция для получения следующего номера документа (атомарная операция)
CREATE OR REPLACE FUNCTION get_next_document_number(doc_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  UPDATE public.document_numbers
  SET current_number = current_number + 1,
      updated_at = NOW()
  WHERE document_type = doc_type
  RETURNING current_number INTO next_num;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Комментарий к функции
COMMENT ON FUNCTION get_next_document_number IS 'Атомарно получает следующий номер документа и инкрементирует счетчик';
