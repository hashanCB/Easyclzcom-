import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string;
  emoji?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'h-8 w-8 text-base',
  md: 'h-11 w-11 text-lg',
  lg: 'h-16 w-16 text-3xl',
  xl: 'h-24 w-24 text-5xl',
};

// Color-theme key → Tailwind gradient classes. Keep in sync with the edge function COLORS list.
export const AVATAR_GRADIENTS: Record<string, string> = {
  blue:    'from-blue-400 to-indigo-500',
  violet:  'from-violet-400 to-purple-500',
  rose:    'from-rose-400 to-pink-500',
  emerald: 'from-emerald-400 to-teal-500',
  amber:   'from-amber-400 to-orange-500',
  cyan:    'from-cyan-400 to-sky-500',
  orange:  'from-orange-400 to-red-500',
  pink:    'from-pink-400 to-fuchsia-500',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export function Avatar({ name, emoji, color, size = 'md', className }: AvatarProps) {
  // Emoji mode — colored gradient circle with the chosen emoji.
  if (emoji) {
    const gradient = AVATAR_GRADIENTS[color ?? 'blue'] ?? AVATAR_GRADIENTS.blue;
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gradient-to-br select-none shrink-0 shadow-sm',
          gradient,
          sizeMap[size],
          className,
        )}
      >
        <span className="leading-none">{emoji}</span>
      </div>
    );
  }

  // Fallback — initials on a soft tint.
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary select-none shrink-0',
        sizeMap[size],
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
