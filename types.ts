// Импортируем общие типы из отдельного файла
export { PostStatus, CarType } from './lib/types/common';
export type { WorkingMode, AlertData } from './lib/types/common';

// Импортируем Booking из API файла
export type { Booking } from './lib/api/bookings';

// Импортируем TireBooking из API файла шиномонтажа
export type { TireBooking } from './lib/api/tire-bookings';

// Импортируем TireService из API файла услуг шиномонтажа
export type { TireService } from './lib/api/tire-services';

// Импортируем Worker из API файла
export type { Worker } from './lib/api/workers';

// Импортируем TireWorker из API файла
export type { TireWorker } from './lib/api/tire-workers';

