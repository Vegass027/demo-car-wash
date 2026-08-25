-- Таблица для закрытых боксов
CREATE TABLE closed_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_number INTEGER NOT NULL UNIQUE,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска
CREATE INDEX idx_closed_boxes_status ON closed_boxes(box_number, is_closed);

-- Заполняем для 3 боксов
INSERT INTO closed_boxes (box_number, is_closed) VALUES
  (1, false),
  (2, false),
  (3, false);

-- RLS отключаем (админы должны управлять)
ALTER TABLE closed_boxes DISABLE ROW LEVEL SECURITY;



ALTER TABLE closed_boxes 
ADD COLUMN closed_date DATE;

-- Убрать UNIQUE с box_number
ALTER TABLE closed_boxes 
DROP CONSTRAINT closed_boxes_box_number_key;

-- Добавить UNIQUE на пару (box_number + date)
ALTER TABLE closed_boxes 
ADD CONSTRAINT unique_box_date UNIQUE (box_number, closed_date);