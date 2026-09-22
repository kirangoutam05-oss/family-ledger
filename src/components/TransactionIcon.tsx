import React from 'react';
import { Category } from '../types';
import { getCategoryIcon } from '../utils/helpers';
import { getBrandIcon } from '../utils/brandIcons';

interface TransactionIconProps {
  title: string;
  // Searched the same as title — catches a UPI app that only shows up in
  // the bank field (e.g. bankName "GPay UPI") or a merchant named in notes.
  bankName?: string;
  notes?: string;
  category: Category;
  // Overrides the category's own color/badge when it's a special-status
  // row (e.g. the amber "grey area" tint) — a recognized brand still wins
  // on the icon itself, just not the background tint, so status stays legible.
  colorOverride?: string;
  className?: string;
  iconClassName?: string;
}

// A category badge that upgrades to the merchant's or UPI app's own logo
// when the transaction's text matches a brand we recognize (Swiggy,
// Netflix, GPay, CRED, ...), so the transaction list reads at a glance
// instead of via a handful of repeated generic category glyphs.
export const TransactionIcon: React.FC<TransactionIconProps> = ({
  title,
  bankName,
  notes,
  category,
  colorOverride,
  className = 'w-10 h-10 rounded-xl',
  iconClassName = 'w-5 h-5',
}) => {
  const brand = getBrandIcon(title, bankName, notes);
  const bg = colorOverride || (brand ? `#${brand.hex}` : category.color);

  return (
    <div
      className={`${className} flex items-center justify-center text-white shrink-0`}
      style={{ backgroundColor: bg }}
      title={brand ? brand.title : category.name}
    >
      {brand ? (
        <svg
          viewBox={brand.viewBox || '0 0 24 24'}
          role="img"
          className={iconClassName}
          fill={brand.bodyHtml ? 'none' : 'currentColor'}
          style={brand.strokeWidth ? { strokeWidth: brand.strokeWidth } : undefined}
        >
          {brand.bodyHtml ? (
            <g dangerouslySetInnerHTML={{ __html: brand.bodyHtml }} />
          ) : (
            <path d={brand.path} />
          )}
        </svg>
      ) : (
        getCategoryIcon(category.icon, iconClassName)
      )}
    </div>
  );
};
