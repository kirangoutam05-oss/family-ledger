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
} from 'lucide-react';
import { CategoryId } from '../types';

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
    default:
      return React.createElement(Wallet, { className });
  }
}
