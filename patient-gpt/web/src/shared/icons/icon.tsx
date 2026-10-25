// TJ-ARCH-MOB-001 compliant
// Icons render the module's own constant markup (ICON_PATHS); no data or user
// input ever reaches dangerouslySetInnerHTML here.
import { ICON_PATHS, type IconName } from './icon-paths'

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `ico ${className}` : 'ico'}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}
