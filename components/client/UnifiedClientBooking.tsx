import React from 'react';
import { ShowerHead, LifeBuoy, Car } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ClientBookingWrapper } from './ClientBookingWrapper';
import { ClientTireBookingWrapper } from './ClientTireBookingWrapper';
import { MyGarage } from './MyGarage';
import { Service } from '../../lib/api/services';
import { Organization, OrganizationDriver, OrganizationCar } from '../../entities/organization/model';
import { Client } from '../../lib/api/clients';

type ServiceType = 'carwash' | 'tire' | 'my-garage';

interface UnifiedClientBookingProps {
  activeService: ServiceType;
  setActiveService: (service: ServiceType) => void;
  services: Service[];
  tireServices: any[];
  organizations: Organization[];
  organizationDrivers: OrganizationDriver[];
  organizationCars: OrganizationCar[];
  clients: Client[];
  onWizardOpen?: () => void;
  onWizardClose?: () => void;
  isWizardOpen?: boolean; // ✅ Один источник правды для состояния мастера
}

export const UnifiedClientBooking = ({
  activeService,
  setActiveService,
  services,
  tireServices,
  organizations,
  organizationDrivers,
  organizationCars,
  clients,
  onWizardOpen,
  onWizardClose,
  isWizardOpen = false // ✅ Один источник правды для состояния мастера
}: UnifiedClientBookingProps) => {

  const NavBtn = ({ icon, label, active, onClick }: {
    icon: React.ReactNode,
    label: string,
    active: boolean,
    onClick: () => void
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-200 active:scale-95",
        active ? "text-primary" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {React.cloneElement(icon as React.ReactElement<any>, {
        className: cn("w-6 h-6 transition-transform", active && "scale-110")
      })}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );

  return (
    <>
      {/* ✅ Рендерим все компоненты всегда, скрываем через CSS */}
      <div className={cn(
        "transition-opacity duration-200",
        activeService === 'carwash' ? 'block' : 'hidden'
      )}>
        <ClientBookingWrapper
          services={services}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
          onWizardOpen={onWizardOpen}
          onWizardClose={onWizardClose}
          isWizardOpen={isWizardOpen}
        />
      </div>

      <div className={cn(
        "transition-opacity duration-200",
        activeService === 'tire' ? 'block' : 'hidden'
      )}>
        <ClientTireBookingWrapper
          tireServices={tireServices}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
          onWizardOpen={onWizardOpen}
          onWizardClose={onWizardClose}
          isWizardOpen={isWizardOpen}
        />
      </div>
      
      <div className={cn(
        "transition-opacity duration-200",
        activeService === 'my-garage' ? 'block' : 'hidden'
      )}>
        <MyGarage
          services={services}
          tireServices={tireServices}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
        />
      </div>
    </>
  );
};
