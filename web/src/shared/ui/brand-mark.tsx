import asoIcon from '@/assets/brand/aso-icon.svg';
import asoLogo from '@/assets/brand/aso-logo.svg';
import { cn } from '@/lib/utils';

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return compact ? (
    <img src={asoIcon} alt="Advanced Spine & Orthopedics" className={cn('size-9', className)} />
  ) : (
    <img src={asoLogo} alt="Advanced Spine & Orthopedics" className={cn('h-auto w-48', className)} />
  );
}
