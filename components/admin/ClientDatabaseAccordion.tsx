import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, User, Building, Car, Phone, Search, Copy, Check } from 'lucide-react';
import { Input } from '../ui/input';
import { getClientsWithCars } from '../../lib/api/clients';
import { getOrganizationsWithDriversAndCars } from '../../lib/api/organizations';
import type { Client, ClientCar } from '../../lib/api/clients';
import type { Organization, OrganizationCar, OrganizationDriver } from '../../lib/api/organizations';

interface ClientDatabaseAccordionProps {
  onSelectClient?: (clientId: string, clientCarId: string, clientName: string, phone: string, carModel: string, carNumber: string, carType: string) => void;
}

/**
 * Компонент аккордеона для базы клиентов и организаций
 * Отображает физ. лица и организации с их автомобилями
 */
export const ClientDatabaseAccordion: React.FC<ClientDatabaseAccordionProps> = ({
  onSelectClient
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Данные клиентов
  const [clientsWithCars, setClientsWithCars] = useState<Array<{
    client: Client;
    cars: ClientCar[];
  }>>([]);

  // Данные организаций с водителями и машинами
  const [organizationsWithDriversAndCars, setOrganizationsWithDriversAndCars] = useState<Array<{
    organization: Organization;
    drivers: OrganizationDriver[];
    cars: OrganizationCar[];
  }>>([]);
  
  // Состояние открытых секций
  const [openSubSection, setOpenSubSection] = useState<'clients' | 'organizations' | null>(null);
  
  // Состояние открытых клиентов/организаций
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [openOrganizationId, setOpenOrganizationId] = useState<string | null>(null);

  // Состояние поиска
  const [searchQuery, setSearchQuery] = useState('');

  // Состояние скопированных гос номеров
  const [copiedPlateNumbers, setCopiedPlateNumbers] = useState<Set<string>>(new Set());

  // Загрузка данных при первом рендере
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [clients, organizations] = await Promise.all([
          getClientsWithCars(),
          getOrganizationsWithDriversAndCars()
        ]);
        setClientsWithCars(clients);
        setOrganizationsWithDriversAndCars(organizations);
      } catch (err) {
        console.error('[ClientDatabaseAccordion] Ошибка загрузки данных:', err);
        setError('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Форматирование номера телефона
  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `+7 ${cleaned.slice(1, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9, 11)}`;
    }
    return phone;
  };

  // Копирование в буфер обмена
  const copyToClipboard = async (text: string, carId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlateNumbers(prev => new Set([...prev, carId]));
      setTimeout(() => {
        setCopiedPlateNumbers(prev => {
          const newSet = new Set(prev);
          newSet.delete(carId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  };

  return (
    <div className="px-4 pb-4 bg-gray-50">
      <div className="border-t border-gray-200 pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* ФИЗИЧЕСКИЕ ЛИЦА */}
            <div className="border border-gray-200 rounded-lg bg-white">
              <div
                onClick={() => setOpenSubSection(openSubSection === 'clients' ? null : 'clients')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-purple-600" />
                  <span className="font-semibold text-gray-900">Физ. лица</span>
                  <span className="text-sm text-gray-500">({clientsWithCars.length})</span>
                </div>
                <div className="text-gray-400">
                  {openSubSection === 'clients' ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>
              </div>

              {openSubSection === 'clients' && (
                <>
                  <div className="border-t border-gray-200"></div>
                  <div className="px-4 py-2">
                    {/* Поле поиска */}
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Поиск по имени..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Фильтрация клиентов по поисковому запросу */}
                    {(() => {
                      const filteredClients = clientsWithCars
                        .filter(({ client }) =>
                          searchQuery === '' || client.full_name.toLowerCase().startsWith(searchQuery.toLowerCase())
                        )
                        .sort((a, b) => a.client.full_name.localeCompare(b.client.full_name, 'ru'));

                      if (filteredClients.length === 0) {
                        return (
                          <div className="text-center py-8 text-gray-500">
                            {searchQuery ? 'Ничего не найдено' : 'Нет физических лиц'}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {filteredClients.map(({ client, cars }) => (
                          <div key={client.id} className="border border-gray-200 rounded-lg bg-gray-50">
                            <div
                              onClick={() => setOpenClientId(openClientId === client.id ? null : client.id)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors cursor-pointer select-none rounded-lg"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <User className="w-4 h-4 text-gray-600" />
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{client.full_name}</div>
                                  <div className="text-sm text-gray-500 flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {formatPhone(client.phone)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                                  {cars.length} {cars.length === 1 ? 'машина' : cars.length > 1 && cars.length < 5 ? 'машины' : 'машин'}
                                </span>
                                <div className="text-gray-400">
                                  {openClientId === client.id ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </div>
                              </div>
                            </div>

                             {openClientId === client.id && (
                               <>
                                 <div className="border-t border-gray-200"></div>
                                 <div className="px-4 py-2">
                                   {cars.length === 0 ? (
                                     <div className="text-center py-4 text-sm text-gray-500">
                                       Нет автомобилей
                                     </div>
                                   ) : (
                                     <div className="space-y-2">
                                       {cars.map((car) => (
                                         <div
                                           key={car.id}
                                           onClick={() => onSelectClient && onSelectClient(
                                             client.id,
                                             car.id,
                                             client.full_name,
                                             client.phone,
                                             car.car_model,
                                             car.plate_number,
                                             car.car_type
                                           )}
                                           className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-purple-600 hover:bg-purple-50 transition-colors"
                                         >
                                           <Car className="w-4 h-4 text-gray-600" />
                                           <div className="flex-1">
                                             <div className="font-medium text-gray-900">{car.car_model}</div>
                                             <div className="text-sm text-gray-500">{car.plate_number}</div>
                                           </div>
                                         </div>
                                       ))}
                                     </div>
                                   )}
                                 </div>
                               </>
                             )}
                          </div>
                        ))}
                      </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* ОРГАНИЗАЦИИ */}
            <div className="border border-gray-200 rounded-lg bg-white">
              <div
                onClick={() => setOpenSubSection(openSubSection === 'organizations' ? null : 'organizations')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer select-none rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Building className="w-5 h-5 text-purple-600" />
                  <span className="font-semibold text-gray-900">Организации</span>
                  <span className="text-sm text-gray-500">({organizationsWithDriversAndCars.length})</span>
                </div>
                <div className="text-gray-400">
                  {openSubSection === 'organizations' ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>
              </div>

              {openSubSection === 'organizations' && (
                <>
                  <div className="border-t border-gray-200"></div>
                  <div className="px-4 py-2">
                    {organizationsWithDriversAndCars.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        Нет организаций
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {organizationsWithDriversAndCars
                          .sort((a, b) => a.organization.name.localeCompare(b.organization.name, 'ru'))
                          .map(({ organization, drivers, cars }) => (
                          <div key={organization.id} className="border border-gray-200 rounded-lg bg-gray-50">
                            <div
                              onClick={() => setOpenOrganizationId(openOrganizationId === organization.id ? null : organization.id)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors cursor-pointer select-none rounded-lg"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <Building className="w-4 h-4 text-gray-600" />
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900">{organization.name}</div>
                                  {organization.contact_phone && (
                                    <div className="text-sm text-gray-500 flex items-center gap-1">
                                      <Phone className="w-3 h-3" />
                                      {formatPhone(organization.contact_phone)}
                                    </div>
                                  )}
                                </div>
                               </div>
                               <div className="flex items-center gap-2">
                                 <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                                   {cars.length} {cars.length === 1 ? 'машина' : cars.length > 1 && cars.length < 5 ? 'машины' : 'машин'}
                                 </span>
                                 <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                                   {drivers.length} {drivers.length === 1 ? 'водитель' : drivers.length > 1 && drivers.length < 5 ? 'водителя' : 'водителей'}
                                 </span>
                                 <div className="text-gray-400">
                                   {openOrganizationId === organization.id ? (
                                     <ChevronUp className="w-4 h-4" />
                                   ) : (
                                     <ChevronDown className="w-4 h-4" />
                                   )}
                                 </div>
                               </div>
                             </div>

                             {openOrganizationId === organization.id && (
                               <>
                                 <div className="border-t border-gray-200"></div>
                                 <div className="px-4 py-2">
                                   {/* Список водителей */}
                                   {drivers.length === 0 ? (
                                     <div className="text-center py-4 text-sm text-gray-500">
                                       Нет водителей
                                     </div>
                                   ) : (
                                     <div className="space-y-2 mb-4">
                                       {drivers.map((driver) => (
                                         <div key={driver.id} className="bg-gray-100 p-3 rounded-lg">
                                           <div className="font-medium text-gray-900 mb-2">{driver.full_name}</div>
                                           {driver.phone && (
                                             <div className="text-sm text-gray-500 flex items-center gap-1">
                                               <Phone className="w-3 h-3" />
                                               {formatPhone(driver.phone)}
                                             </div>
                                           )}
                                         </div>
                                       ))}
                                     </div>
                                   )}

                                    {/* Список машин */}
                                    {cars.length === 0 ? (
                                      <div className="text-center py-4 text-sm text-gray-500">
                                        Нет автомобилей
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {cars.map((car) => (
                                          <div
                                            key={car.id}
                                            className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200"
                                          >
                                            <Car className="w-4 h-4 text-gray-600" />
                                            <div className="flex-1">
                                              <div className="font-medium text-gray-900">{car.car_model}</div>
                                              <div className="text-sm text-gray-500 flex items-center gap-2">
                                                {car.plate_number}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(car.plate_number, car.id);
                                                  }}
                                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                                  title={copiedPlateNumbers.has(car.id) ? 'Скопировано!' : 'Скопировать'}
                                                >
                                                  {copiedPlateNumbers.has(car.id) ? (
                                                    <Check className="w-3 h-3 text-green-600" />
                                                  ) : (
                                                    <Copy className="w-3 h-3 text-gray-500 hover:text-purple-600" />
                                                  )}
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                 </div>
                               </>
                             )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
