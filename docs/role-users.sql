-- Сделать себя владельцем
UPDATE profiles 
SET role = 'owner' 
WHERE phone = '+79965228101';

-- Назначить админов
UPDATE profiles 
SET role = 'admin' 
WHERE phone IN ('+79965228102', '++79965228103');
