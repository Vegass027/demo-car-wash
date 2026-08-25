import React, { useState } from 'react';
import { ShowerHead, Phone, MapPin, Clock, Mail, FileText, Wrench, Menu, X, Zap, Gem, Smartphone } from 'lucide-react';
import { Service } from '../../lib/api/services';
import { TireService } from '../../lib/api/tire-services';

interface PublicPageProps {
  services: Service[];
  tireServices: TireService[];
}

export function PublicPage({ services, tireServices }: PublicPageProps) {
  const [activeSection, setActiveSection] = useState<'hero' | 'services' | 'tire-services' | 'contacts' | 'oferta'>('hero');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="bg-[#f5f5f5] text-gray-900 font-sans" style={{ minHeight: 'calc(var(--vh) * 100)' }}>
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setActiveSection('hero');
                setIsMobileMenuOpen(false);
              }}
              className="text-xl md:text-2xl font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              Автомойка "Фреш"
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex gap-6">
              <button
                onClick={() => setActiveSection('services')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'services'
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-blue-600'
                }`}
              >
                Мойка
              </button>
              <button
                onClick={() => setActiveSection('tire-services')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'tire-services'
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-blue-600'
                }`}
              >
                Шиномонтаж
              </button>
              <button
                onClick={() => setActiveSection('contacts')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'contacts'
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-blue-600'
                }`}
              >
                Контакты
              </button>
              <button
                onClick={() => setActiveSection('oferta')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'oferta'
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-blue-600'
                }`}
              >
                Оферта
              </button>
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Меню"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-600" />
              ) : (
                <Menu className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMobileMenuOpen && (
            <nav className="md:hidden mt-4 pb-4 border-t pt-4">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setActiveSection('services');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`text-left px-4 py-2 rounded-lg transition-colors ${
                    activeSection === 'services'
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Мойка
                </button>
                <button
                  onClick={() => {
                    setActiveSection('tire-services');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`text-left px-4 py-2 rounded-lg transition-colors ${
                    activeSection === 'tire-services'
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Шиномонтаж
                </button>
                <button
                  onClick={() => {
                    setActiveSection('contacts');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`text-left px-4 py-2 rounded-lg transition-colors ${
                    activeSection === 'contacts'
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Контакты
                </button>
                <button
                  onClick={() => {
                    setActiveSection('oferta');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`text-left px-4 py-2 rounded-lg transition-colors ${
                    activeSection === 'oferta'
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Оферта
                </button>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {activeSection === 'hero' && <HeroSection />}
        {activeSection === 'services' && <ServicesSection services={services} />}
        {activeSection === 'tire-services' && <TireServicesSection tireServices={tireServices} />}
        {activeSection === 'contacts' && <ContactsSection />}
        {activeSection === 'oferta' && <OfertaSection onSectionChange={setActiveSection} />}
      </main>

      {/* Footer */}
      <Footer onSectionChange={setActiveSection} />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="text-center py-8 md:py-16">
      <div className="max-w-2xl mx-auto px-4">
        <h2 className="text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-gray-900">
          Автомойка и шиномонтаж в Ростове-на-Дону
        </h2>
        <p className="text-lg md:text-xl text-gray-600 mb-6 md:mb-8">
          Запишитесь онлайн через Telegram за 1 минуту
        </p>
        <a
          href="https://t.me/dovatora_car_wash_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full md:w-auto bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-lg text-base md:text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
        >
          <Smartphone className="w-5 h-5 md:w-6 md:h-6" />
          Записаться через Telegram
        </a>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mt-8 md:mt-16">
          <div className="text-center p-4 md:p-6 bg-white rounded-lg shadow-sm">
            <div className="flex justify-center mb-2 md:mb-4">
              <Zap className="w-8 h-8 md:w-12 md:h-12 text-blue-600" />
            </div>
            <h3 className="text-lg md:text-xl font-bold mb-1 md:mb-2">Быстро</h3>
            <p className="text-sm md:text-base text-gray-600">Мойка за 30-60 минут</p>
          </div>
          <div className="text-center p-4 md:p-6 bg-white rounded-lg shadow-sm">
            <div className="flex justify-center mb-2 md:mb-4">
              <Gem className="w-8 h-8 md:w-12 md:h-12 text-blue-600" />
            </div>
            <h3 className="text-lg md:text-xl font-bold mb-1 md:mb-2">Качественно</h3>
            <p className="text-sm md:text-base text-gray-600">Профессиональное оборудование</p>
          </div>
          <div className="text-center p-4 md:p-6 bg-white rounded-lg shadow-sm">
            <div className="flex justify-center mb-2 md:mb-4">
              <Smartphone className="w-8 h-8 md:w-12 md:h-12 text-blue-600" />
            </div>
            <h3 className="text-lg md:text-xl font-bold mb-1 md:mb-2">Удобно</h3>
            <p className="text-sm md:text-base text-gray-600">Онлайн-запись через Telegram</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicesSection({ services }: { services: Service[] }) {
  return (
    <section className="py-8 px-4">
      <h2 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 text-center text-blue-600">
        Услуги автомойки
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-12">
        {services
          .filter(svc => svc.is_visible_in_online_booking !== false)
          .map((service) => (
          <div
            key={service.id}
            className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4">{service.name}</h3>
            <div className="space-y-1 md:space-y-2 text-xs md:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Седан:</span>
                <span className="font-semibold">{service.price_sedan} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Кроссовер:</span>
                <span className="font-semibold">{service.price_crossover} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Джип:</span>
                <span className="font-semibold">{service.price_jeep} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Большой джип:</span>
                <span className="font-semibold">{service.price_large_suv} ₽</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Минивэн:</span>
                <span className="font-semibold">{service.price_minivan} ₽</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center bg-blue-50 p-6 md:p-8 rounded-lg">
        <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">
          Готовы записаться?
        </h3>
        <p className="mb-4 md:mb-6 text-sm md:text-base text-gray-600">
          Запишитесь онлайн через наш Telegram-бот
        </p>
        <a
          href="https://t.me/dovatora_car_wash_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full md:w-auto bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-lg text-base md:text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          <Smartphone className="w-5 h-5 md:w-6 md:h-6" />
          Записаться сейчас
        </a>
      </div>
    </section>
  );
}

function TireServicesSection({ tireServices }: { tireServices: TireService[] }) {
  const categories = Array.from(new Set(tireServices.map(s => s.category)));

  return (
    <section className="py-8 px-4">
      <h2 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 text-center text-blue-600">
        Услуги шиномонтажа
      </h2>

      {categories.map(category => (
        <div key={category} className="mb-8 md:mb-12">
          <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-gray-800 flex items-center gap-2">
            <Wrench className="w-5 md:w-6 h-5 md:h-6 text-blue-600" />
            {category}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {tireServices
              .filter(service => service.category === category)
              .map((service) => (
                <div
                  key={service.id}
                  className="bg-white p-3 md:p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <h4 className="text-base md:text-lg font-bold mb-2">{service.name}</h4>
                  <div className="space-y-1 text-xs md:text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Цена:</span>
                      <span className="font-semibold text-blue-600">{service.price} ₽</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="text-center bg-blue-50 p-6 md:p-8 rounded-lg mt-8 md:mt-12">
        <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">
          Готовы записаться?
        </h3>
        <p className="mb-4 md:mb-6 text-sm md:text-base text-gray-600">
          Запишитесь онлайн через наш Telegram-бот
        </p>
        <a
          href="https://t.me/dovatora_car_wash_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full md:w-auto bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-lg text-base md:text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          <Smartphone className="w-5 h-5 md:w-6 md:h-6" />
          Записаться сейчас
        </a>
      </div>
    </section>
  );
}

function ContactsSection() {
  return (
    <section className="py-8 px-4">
      <h2 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 text-center text-blue-600">
        Контакты и реквизиты
      </h2>

      <div className="max-w-2xl mx-auto space-y-6 md:space-y-8">
        {/* Contact Info */}
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-sm">
          <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 flex items-center gap-2">
            <Phone className="w-5 md:w-6 h-5 md:h-6" />
            Контактная информация
          </h3>

          <div className="space-y-3 md:space-y-4">
            <div className="flex items-start gap-3 md:gap-4">
              <MapPin className="w-5 md:w-6 h-5 md:h-6 text-blue-600 mt-0.5 md:mt-1 flex-shrink-0" />
              <div>
                <div className="font-semibold text-sm md:text-base">Адрес:</div>
                <div className="text-sm md:text-base">г. Ростов-на-Дону, ул. Доватора, 154/3</div>
              </div>
            </div>

            <div className="flex items-start gap-3 md:gap-4">
              <Phone className="w-5 md:w-6 h-5 md:h-6 text-blue-600 mt-0.5 md:mt-1 flex-shrink-0" />
              <div>
                <div className="font-semibold text-sm md:text-base">Телефон:</div>
                <div className="text-sm md:text-base">8 (928) 193-06-00</div>
              </div>
            </div>

            <div className="flex items-start gap-3 md:gap-4">
              <Mail className="w-5 md:w-6 h-5 md:h-6 text-blue-600 mt-0.5 md:mt-1 flex-shrink-0" />
              <div>
                <div className="font-semibold text-sm md:text-base">Email:</div>
                <div className="text-sm md:text-base break-all">Borec0096@mail.ru</div>
              </div>
            </div>

            <div className="flex items-start gap-3 md:gap-4">
              <Clock className="w-5 md:w-6 h-5 md:h-6 text-blue-600 mt-0.5 md:mt-1 flex-shrink-0" />
              <div>
                <div className="font-semibold text-sm md:text-base">Режим работы:</div>
                <div className="text-sm md:text-base">Ежедневно с 8:00 до 18:00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Requisites */}
        <div className="bg-gray-50 p-6 md:p-8 rounded-lg">
          <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 flex items-center gap-2">
            <FileText className="w-5 md:w-6 h-5 md:h-6" />
            Реквизиты
          </h3>

          <div className="space-y-2 md:space-y-3 text-sm md:text-base">
            <div>
              <span className="font-semibold block mb-1">Полное наименование:</span>
              <div className="break-all">ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ГАЛКИН ВЛАДИМИР ВАСИЛЬЕВИЧ</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">ИНН:</span>
              <div>616702768541</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">ОГРНИП:</span>
              <div>326619600004222</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">Юридический адрес:</span>
              <div>г. Ростов-на-Дону, ул. Доватора, 154/3</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">Расчётный счёт:</span>
              <div className="break-all">40802810952740019008</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">Банк:</span>
              <div>ЮГО-ЗАПАДНЫЙ БАНК ПАО СБЕРБАНК</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">БИК банка:</span>
              <div>046015602</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">Корр. счёт:</span>
              <div className="break-all">30101810600000000602</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">ИНН банка:</span>
              <div>7707083893</div>
            </div>

            <div>
              <span className="font-semibold block mb-1">КПП банка:</span>
              <div>616143002</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OfertaSection({ onSectionChange }: { onSectionChange: (section: 'hero' | 'services' | 'tire-services' | 'contacts' | 'oferta') => void }) {
  return (
    <section className="py-8 px-4">
      <h2 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8 text-center text-blue-600">
        Договор публичной оферты
      </h2>

      <div className="max-w-4xl mx-auto bg-white p-6 md:p-8 rounded-lg shadow-sm">
        <p className="text-center text-gray-600 mb-6 md:mb-8 text-sm md:text-base">
          на оказание услуг автомойки
        </p>

        <div className="space-y-6 md:space-y-8 text-sm md:text-base">
          {/* Раздел 1 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">1. ОБЩИЕ ПОЛОЖЕНИЯ</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>1.1. Индивидуальный предприниматель ГАЛКИН ВЛАДИМИР ВАСИЛЬЕВИЧ (ИНН 616702768541, ОГРНИП 326619600004222), именуемый в дальнейшем «Исполнитель», публикует настоящую публичную оферту о заключении договора на оказание услуг автомойки.</p>
              <p>1.2. В соответствии со статьёй 437 Гражданского кодекса Российской Федерации (ГК РФ) данный документ является публичной офертой, и в случае принятия изложенных ниже условий физическое лицо, производящее акцепт этой оферты, осуществляет оплату услуг Исполнителя в соответствии с условиями настоящего Договора.</p>
              <p>1.3. Настоящая оферта вступает в силу с момента размещения на сайте и действует до момента отзыва оферты Исполнителем.</p>
            </div>
          </div>

          {/* Раздел 2 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">2. ПРЕДМЕТ ДОГОВОРА</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>2.1. Исполнитель обязуется оказать Клиенту услуги по мойке и уходу за автомобилем, а Клиент обязуется оплатить данные услуги в порядке и на условиях настоящего Договора.</p>
              <p>2.2. Перечень услуг, их характеристики и стоимость указаны на странице <button onClick={() => onSectionChange('services')} className="text-blue-600 hover:underline font-semibold bg-transparent border-none p-0 cursor-pointer">Услуги</button>.</p>
            </div>
          </div>

          {/* Раздел 3 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">3. ПОРЯДОК ОКАЗАНИЯ УСЛУГ</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>3.1. Услуги оказываются по адресу: г. Ростов-на-Дону, ул. Доватора, 154/3.</p>
              <p>3.2. Запись на услуги осуществляется через Telegram-бот @dovatora_car_wash_bot .<br />Или по телефону: 8 (928) 193-06-00.</p>
              <p>3.3. Время оказания услуг согласовывается с Клиентом при оформлении записи.</p>
              <p>3.4. Клиент обязан предоставить автомобиль в согласованное время.</p>
            </div>
          </div>

          {/* Раздел 4 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">4. СТОИМОСТЬ УСЛУГ</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>4.1. Стоимость услуг указана на странице <button onClick={() => onSectionChange('services')} className="text-blue-600 hover:underline font-semibold bg-transparent border-none p-0 cursor-pointer">Услуги</button>.</p>
              <p>4.2. Исполнитель вправе изменять стоимость услуг в одностороннем порядке, опубликовав новые цены на сайте. Изменение цен не распространяется на уже оплаченные услуги.</p>
            </div>
          </div>

          {/* Раздел 5 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">5. ПОРЯДОК ОПЛАТЫ</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>5.1. Оплата услуг производится следующими способами:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Наличными в кассе Исполнителя</li>
                <li>Банковской картой на месте</li>
                <li>Онлайн через Систему быстрых платежей (СБП)</li>
              </ul>
              <p>5.2. При онлайн-оплате Клиент получает электронный чек на указанный при записи номер телефона или email.</p>
            </div>
          </div>

          {/* Раздел 6 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">6. ПРАВА И ОБЯЗАННОСТИ СТОРОН</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>6.1. Исполнитель обязуется:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Оказать услуги качественно и в срок</li>
                <li>Использовать профессиональное оборудование</li>
                <li>Бережно обращаться с автомобилем Клиента</li>
              </ul>
              <p>6.2. Клиент обязуется:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Оплатить услуги</li>
                <li>Предоставить автомобиль в согласованное время</li>
                <li>Убрать ценные вещи из автомобиля</li>
              </ul>
            </div>
          </div>

          {/* Раздел 7 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">7. ОТВЕТСТВЕННОСТЬ СТОРОН</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>7.1. За неисполнение или ненадлежащее исполнение обязательств по настоящему Договору Стороны несут ответственность в соответствии с действующим законодательством РФ.</p>
              <p>7.2. Исполнитель не несёт ответственности за ценные вещи, оставленные в автомобиле.</p>
            </div>
          </div>

          {/* Раздел 8 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">8. ВОЗВРАТ СРЕДСТВ</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>8.1. При отмене записи Клиентом за 24 часа и более до назначенного времени — возврат средств в размере 100%.</p>
              <p>8.2. При отмене записи менее чем за 24 часа — возврат средств не производится.</p>
              <p>8.3. При неоказании услуги по вине Исполнителя — возврат средств в размере 100%.</p>
            </div>
          </div>

          {/* Раздел 9 */}
          <div className="border-b border-gray-200 pb-6 md:pb-8">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">9. ПРОЧИЕ УСЛОВИЯ</h3>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>9.1. Настоящий Договор регулируется действующим законодательством Российской Федерации.</p>
              <p>9.2. Все споры решаются путём переговоров, при недостижении согласия — в судебном порядке по месту нахождения Исполнителя.</p>
            </div>
          </div>

          {/* Раздел 10 */}
          <div>
            <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900">10. РЕКВИЗИТЫ ИСПОЛНИТЕЛЯ</h3>
            <div className="bg-gray-50 p-4 md:p-6 rounded-lg text-sm md:text-base">
              <div className="space-y-3 text-gray-700">
                <p className="mb-2"><strong className="text-gray-900">Индивидуальный предприниматель</strong><br />ГАЛКИН ВЛАДИМИР ВАСИЛЬЕВИЧ</p>
                <p className="mb-2"><strong className="text-gray-900">ИНН:</strong> 616702768541<br /><strong className="text-gray-900">ОГРНИП:</strong> 326619600004222</p>
                <p className="mb-2"><strong className="text-gray-900">Адрес:</strong> г. Ростов-на-Дону, ул. Доватора, 154/3</p>
                <p className="mb-2"><strong className="text-gray-900">Телефон:</strong> 8 (928) 193-06-00<br /><strong className="text-gray-900">Email:</strong> Borec0096@mail.ru</p>
                <p className="mb-2"><strong className="text-gray-900">Расчётный счёт:</strong> 40802810952740019008</p>
                <p className="mb-2"><strong className="text-gray-900">Банк:</strong> ЮГО-ЗАПАДНЫЙ БАНК ПАО СБЕРБАНК</p>
                <p className="mb-2"><strong className="text-gray-900">БИК банка:</strong> 046015602</p>
                <p className="mb-2"><strong className="text-gray-900">Корр. счёт:</strong> 30101810600000000602</p>
                <p className="mb-2"><strong className="text-gray-900">ИНН банка:</strong> 7707083893</p>
                <p><strong className="text-gray-900">КПП банка:</strong> 616143002</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ onSectionChange }: { onSectionChange: (section: 'hero' | 'services' | 'tire-services' | 'contacts' | 'oferta') => void }) {
  return (
    <footer className="bg-gray-900 text-white py-6 md:py-8 mt-8 md:mt-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
          <div>
            <h3 className="font-bold mb-3 md:mb-4 text-blue-400 text-base md:text-base">Контакты</h3>
            <p className="text-xs md:text-sm text-gray-300">
              г. Ростов-на-Дону, ул. Доватора, 154/3<br />
              8 (928) 193-06-00<br />
              Borec0096@mail.ru
            </p>
          </div>

          <div>
            <h3 className="font-bold mb-3 md:mb-4 text-blue-400 text-base md:text-base">Режим работы</h3>
            <p className="text-xs md:text-sm text-gray-300">
              Ежедневно<br />
              с 8:00 до 18:00
            </p>
          </div>

          <div>
            <h3 className="font-bold mb-3 md:mb-4 text-blue-400 text-base md:text-base">Документы</h3>
            <div className="flex flex-col gap-2 text-xs md:text-sm">
              <button
                onClick={() => onSectionChange('oferta')}
                className="text-left text-gray-300 hover:text-blue-400 transition-colors cursor-pointer"
              >
                Договор оферты
              </button>
              <button
                onClick={() => onSectionChange('contacts')}
                className="text-left text-gray-300 hover:text-blue-400 transition-colors cursor-pointer"
              >
                Реквизиты
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 md:pt-8 border-t border-gray-700 text-center text-xs md:text-sm text-gray-400">
          <p>© 2026 Автомойка "Чистота". ИП ГАЛКИН В.В. ИНН 616702768541</p>
        </div>
      </div>
    </footer>
  );
}
