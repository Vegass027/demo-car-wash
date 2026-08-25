-- 1. Организации
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  inn VARCHAR(12),
  contact_person VARCHAR(255),
  contact_phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Водители организаций
CREATE TABLE organization_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Машины организаций
CREATE TABLE organization_cars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  car_model VARCHAR(255) NOT NULL,
  plate_number VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Подписи водителей (ведомость)
CREATE TABLE worksheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  driver_id UUID REFERENCES organization_drivers(id),
  car_id UUID REFERENCES organization_cars(id),
  driver_name VARCHAR(255) NOT NULL,
  car_model VARCHAR(255),
  plate_number VARCHAR(20),
  service_date TIMESTAMP NOT NULL,
  services_provided JSONB NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  signature_data TEXT,
  signed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_organizations_active ON organizations(is_active);
CREATE INDEX idx_org_drivers_org ON organization_drivers(organization_id);
CREATE INDEX idx_org_cars_org ON organization_cars(organization_id);
CREATE INDEX idx_org_cars_plate ON organization_cars(plate_number);
CREATE INDEX idx_worksheet_org ON worksheet_entries(organization_id);
CREATE INDEX idx_worksheet_driver ON worksheet_entries(driver_id);
CREATE INDEX idx_worksheet_car ON worksheet_entries(car_id);
CREATE INDEX idx_worksheet_date ON worksheet_entries(service_date);
