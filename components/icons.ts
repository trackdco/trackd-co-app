"use client";

/**
 * Central icon barrel (see `Context/ui-context.md` → Icons).
 *
 * Every icon in the app is imported from HERE, never from `@phosphor-icons/react`
 * directly. Two reasons:
 *
 *  1. **Global light weight.** These re-exports render inside the
 *     `IconContext.Provider` (weight: "light") mounted in the app root
 *     (`components/providers/icon-provider.tsx`), so stroke weight is set once
 *     and can never drift per-icon.
 *  2. **Server Components can render icons.** Phosphor's icons read React
 *     Context, so importing them into a Server Component would evaluate
 *     `createContext` on the server and crash the build. The `"use client"`
 *     directive above turns these into client references — a Server Component
 *     can render `<Plus />` from this barrel and it hydrates client-side under
 *     the provider, still at light weight. No `/dist/ssr` split, no per-icon
 *     `weight` props.
 *
 * Add an icon here the first time a feature needs it (keep the list sorted).
 */
export {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  ArrowsLeftRight,
  Backspace,
  Barbell,
  Bell,
  CalendarCheck,
  Calculator,
  CalendarBlank,
  CalendarDot,
  CalendarDots,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  // /admin stat tiles: a directional business metric carries an arrow as well
  // as a colour, so the direction is not conveyed by hue alone.
  CaretUp,
  ChartLine,
  ChatCircleDots,
  Check,
  CircleNotch,
  ClipboardText,
  ClockCounterClockwise,
  Compass,
  Copy,
  CreditCard,
  Crown,
  Cylinder,
  DeviceMobile,
  DotsSixVertical,
  DotsThree,
  Download,
  Drop,
  EnvelopeSimple,
  EnvelopeSimpleOpen,
  FileText,
  Flame,
  Flask,
  GearSix,
  GenderFemale,
  GenderMale,
  Hourglass,
  ImageSquare,
  Info,
  InstagramLogo,
  Lightning,
  ListChecks,
  Lock,
  MagnifyingGlass,
  Minus,
  NotePencil,
  Package,
  MapPin,
  Pause,
  PencilSimple,
  Pill,
  Plus,
  Prohibit,
  Plant,
  Pulse,
  Scales,
  Share,
  ShieldCheck,
  SquaresFour,
  Stethoscope,
  Syringe,
  Tag,
  TestTube,
  TiktokLogo,
  Trash,
  TrendUp,
  User,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";

export type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
