import React from 'react';
import {
  UtensilsCrossed,
  ShoppingBag,
  Zap,
  Shirt,
  Car,
  Film,
  HeartPulse,
  TrendingUp,
  HelpCircle,
  Plane,
  ShieldCheck,
  Speaker,
  Wallet,
  Smartphone,
  CreditCard,
  Banknote,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Bell,
  RefreshCw,
  Home,
  Gift,
  Wifi,
  Coffee,
  Dumbbell,
  GraduationCap,
  Wrench,
  Music,
  Gamepad2,
  Fuel,
  Baby,
  PawPrint,
  Briefcase,
  Palette,
  PiggyBank,
  Repeat,
} from 'lucide-react';
import { CategoryId } from '../types';
export { CATEGORY_ICON_OPTIONS } from '../types';

export function formatCurrency(amount: number, currency: string = '₹'): string {
  return `${currency}${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

// A YYYY-MM-DD key built from LOCAL calendar fields — never `toISOString()`,
// which reports the UTC date and silently shifts a timestamp into the wrong
// day whenever the viewer's timezone offset crosses a day boundary. Used
// anywhere a transaction needs to be bucketed or filtered by calendar day
// (trend charts, date-range filters/exports) so it agrees with formatDate.
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getCategoryIcon(iconName: string, className = 'w-5 h-5') {
  switch (iconName) {
    case 'UtensilsCrossed':
      return React.createElement(UtensilsCrossed, { className });
    case 'ShoppingBag':
      return React.createElement(ShoppingBag, { className });
    case 'Zap':
      return React.createElement(Zap, { className });
    case 'Shirt':
      return React.createElement(Shirt, { className });
    case 'Car':
      return React.createElement(Car, { className });
    case 'Film':
      return React.createElement(Film, { className });
    case 'HeartPulse':
      return React.createElement(HeartPulse, { className });
    case 'TrendingUp':
      return React.createElement(TrendingUp, { className });
    case 'Plane':
      return React.createElement(Plane, { className });
    case 'ShieldCheck':
      return React.createElement(ShieldCheck, { className });
    case 'Speaker':
      return React.createElement(Speaker, { className });
    case 'Home':
      return React.createElement(Home, { className });
    case 'Gift':
      return React.createElement(Gift, { className });
    case 'Wifi':
      return React.createElement(Wifi, { className });
    case 'Coffee':
      return React.createElement(Coffee, { className });
    case 'Dumbbell':
      return React.createElement(Dumbbell, { className });
    case 'GraduationCap':
      return React.createElement(GraduationCap, { className });
    case 'Wrench':
      return React.createElement(Wrench, { className });
    case 'Music':
      return React.createElement(Music, { className });
    case 'Gamepad2':
      return React.createElement(Gamepad2, { className });
    case 'Fuel':
      return React.createElement(Fuel, { className });
    case 'Baby':
      return React.createElement(Baby, { className });
    case 'PawPrint':
      return React.createElement(PawPrint, { className });
    case 'Briefcase':
      return React.createElement(Briefcase, { className });
    case 'Palette':
      return React.createElement(Palette, { className });
    case 'PiggyBank':
      return React.createElement(PiggyBank, { className });
    case 'Repeat':
      return React.createElement(Repeat, { className });
    case 'HelpCircle':
    default:
      return React.createElement(HelpCircle, { className });
  }
}

export function getPaymentModeIcon(mode: string, className = 'w-4 h-4') {
  switch (mode) {
    case 'UPI':
      return React.createElement(Smartphone, { className });
    case 'Card':
      return React.createElement(CreditCard, { className });
    case 'Cash':
      return React.createElement(Banknote, { className });
    case 'NetBanking':
    case 'AmazonPayLater':
    case 'Pluxee':
    default:
      return React.createElement(Wallet, { className });
  }
}

// The stored values stay 'Card' / 'AmazonPayLater' (matches existing data,
// the SMS/Gemini parser schema, and server-side validation) — only the
// label shown to people is spelled out.
const PAYMENT_MODE_LABELS: Record<string, string> = {
  Card: 'Credit Card',
  AmazonPayLater: 'Amazon Pay Later',
  Pluxee: 'Pluxee Card',
};

export function getPaymentModeLabel(mode: string): string {
  return PAYMENT_MODE_LABELS[mode] || mode;
}
