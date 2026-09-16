import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Pencil, X, Check, ShieldAlert, Tags, ChevronDown, PenLine } from 'lucide-react';
import { LedgerState, Category, Transaction, CATEGORY_ICON_OPTIONS } from '../types';
import { formatCurrency, formatDate, getCategoryIcon } from '../utils/helpers';

interface CategoryManagerProps {
  ledger: LedgerState;
  onAddCategory: (details: { name: string; icon: string; color: string; budgetMonthly: number }) => Promise<void>;
  onUpdateCategory: (
    categoryId: string,
    updates: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'budgetMonthly'>>
  ) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
}

const COLOR_SWATCHES = [
  '#FF3B30', // red
  '#34C759', // green
  '#007AFF', // blue
  '#5856D6', // purple
  '#FF9500', // orange
  '#FF2D55', // pink
  '#AF52DE', // violet
  '#00C7BE', // teal
];

interface CategoryFormState {
  name: string;
  icon: string;
  color: string;
  budgetMonthly: number | '';
}

const EMPTY_FORM: CategoryFormState = { name: '', icon: 'HelpCircle', color: COLOR_SWATCHES[0], budgetMonthly: '' };

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  ledger,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onEditTransaction,
}) => {
  const { categories, transactions, currency, husbandName, wifeName } = ledger;
  const manageableCategories = categories.filter((c) => c.id !== 'grey_area');

  // Spend-vs-budget, moved here from the Overview screen so budget tracking
  // lives alongside the categories themselves.
  const categorySpend: Record<string, number> = {};
  transactions.forEach((tx) => {
    if (tx.type === 'debit') {
      categorySpend[tx.category] = (categorySpend[tx.category] || 0) + tx.amount;
    }
  });

  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // A single top-level "Edit" toggle reveals per-row edit/delete controls,
  // rather than every row carrying its own edit button permanently — tapping
  // a row in the default state expands its recent transactions instead.
  const [isManaging, setIsManaging] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const toggleManaging = () => {
    setIsManaging((v) => !v);
    setExpandedCategoryId(null);
    setDeleteConfirmId(null);
  };

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  // Most recent transactions for whichever category is expanded — computed
  // once here rather than per-row, since only one can be open at a time.
  const expandedCategoryTransactions = expandedCategoryId
    ? transactions
        .filter((t) => t.category === expandedCategoryId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15)
    : [];

  const openAddForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setFormMode('add');
  };

  const openEditForm = (cat: Category) => {
    setForm({ name: cat.name, icon: cat.icon, color: cat.color, budgetMonthly: cat.budgetMonthly });
    setEditingId(cat.id);
    setError(null);
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Please enter a category name.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const budgetMonthly = form.budgetMonthly === '' ? 0 : Number(form.budgetMonthly);
      if (formMode === 'edit' && editingId) {
        await onUpdateCategory(editingId, { name: form.name.trim(), icon: form.icon, color: form.color, budgetMonthly });
      } else {
        await onAddCategory({ name: form.name.trim(), icon: form.icon, color: form.color, budgetMonthly });
      }
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (categoryId: string) => {
    setIsDeleting(true);
    try {
      await onDeleteCategory(categoryId);
    } catch (err) {
      console.error('Failed to delete category:', err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Categories</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Add, rename, or remove the categories used to organize your household expenses.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleManaging}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 shadow-xs ${
              isManaging
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                : 'bg-black/[0.04] dark:bg-white/[0.08] text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {isManaging ? <Check className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
            <span>{isManaging ? 'Done' : 'Edit'}</span>
          </button>
          <button
            onClick={openAddForm}
            className="px-3 py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {isManaging && (
        <p className="text-[11px] text-neutral-400 px-1 -mt-4">
          Tap the pencil to rename a category, or the trash icon to delete it.
        </p>
      )}

      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs divide-y divide-black/[0.04] dark:divide-white/[0.04] overflow-hidden">
        {manageableCategories.map((cat, index) => {
          const spent = categorySpend[cat.id] || 0;
          const budget = cat.budgetMonthly || 1;
          const percent = Math.min(Math.round((spent / budget) * 100), 100);
          const isOverBudget = spent > cat.budgetMonthly;

          const isExpanded = expandedCategoryId === cat.id;

          return (
          <div key={cat.id} className="animate-fade-slide-up" style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => (isManaging ? undefined : toggleExpanded(cat.id))}
                className="flex-1 min-w-0 p-4 flex items-center gap-3 text-left"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  {getCategoryIcon(cat.icon, 'w-4 h-4')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-neutral-900 dark:text-white truncate min-w-0">
                      {cat.name}
                    </span>
                    <span className={`text-[11px] font-semibold shrink-0 ${isOverBudget ? 'text-red-500' : 'text-neutral-400'}`}>
                      {percent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden mb-1">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: isOverBudget ? '#FF3B30' : cat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                    />
                  </div>
                  <div className="text-xs text-neutral-400">
                    {formatCurrency(spent, currency)} of {formatCurrency(cat.budgetMonthly, currency)}/mo
                    {isOverBudget && <span className="text-red-500 font-medium"> (over)</span>}
                  </div>
                </div>
                {!isManaging && (
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {isManaging && (
                <div className="flex items-center gap-1 shrink-0 pr-3">
                  <button
                    onClick={() => openEditForm(cat)}
                    className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    title="Edit category"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(cat.id)}
                    className="p-2 rounded-lg text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Recent transactions accordion — tapping the row (outside manage
                mode) reveals the last 15 payments in this category, each
                editable in place. */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
                    {expandedCategoryTransactions.length === 0 ? (
                      <p className="text-xs text-neutral-400 py-3 text-center">
                        No transactions in this category yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-black/[0.03] dark:divide-white/[0.03]">
                        {expandedCategoryTransactions.map((tx) => (
                          <button
                            key={tx.id}
                            type="button"
                            onClick={() => onEditTransaction(tx)}
                            className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-lg px-1.5 -mx-1.5 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                                {tx.title}
                              </div>
                              <div className="text-[10px] text-neutral-400 mt-0.5">
                                {formatDate(tx.date)} • {tx.spender === 'husband' ? husbandName : wifeName}
                              </div>
                            </div>
                            <div
                              className={`text-xs font-semibold shrink-0 ${
                                tx.type === 'credit'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-neutral-900 dark:text-white'
                              }`}
                            >
                              {tx.type === 'credit' ? '+' : '-'}
                              {formatCurrency(tx.amount, currency)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {deleteConfirmId === cat.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="px-4 pb-4 overflow-hidden"
                >
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
                    <div className="flex items-start gap-2 text-red-700 dark:text-red-400 text-xs font-semibold">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Delete "{cat.name}"? Any expenses currently in this category will move to Utilities & Rent.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmDelete(cat.id)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold transition-transform active:scale-95"
                      >
                        {isDeleting ? 'Deleting...' : 'Yes, delete it'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs text-neutral-600 dark:text-neutral-300 transition-transform active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          );
        })}

        {manageableCategories.length === 0 && (
          <div className="p-12 text-center space-y-2">
            <Tags className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mx-auto" />
            <p className="text-xs text-neutral-400">No categories yet. Add your first one to get started.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Category Modal */}
      <AnimatePresence>
        {formMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && closeForm()}
          >
          <motion.form
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            onSubmit={handleSubmit}
            className="glass-sheet rounded-[24px] max-w-sm w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-4 max-h-[88dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {formMode === 'edit' ? 'Edit Category' : 'New Category'}
              </h3>
              <button type="button" onClick={closeForm} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-500 block mb-1">Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Home Maintenance"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-500 block mb-1">
                Monthly Budget ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="500"
                placeholder="e.g. 5000"
                value={form.budgetMonthly}
                onChange={(e) => setForm((f) => ({ ...f, budgetMonthly: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-sm font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-500 block mb-1.5">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color }))}
                    className={`w-7 h-7 rounded-full transition-transform shrink-0 ${
                      form.color === color ? 'scale-110 ring-2 ring-offset-2 ring-black/20 dark:ring-offset-neutral-900' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-500 block mb-1.5">Icon</label>
              <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto pr-1">
                {CATEGORY_ICON_OPTIONS.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon: iconName }))}
                    className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
                      form.icon === iconName
                        ? 'text-white'
                        : 'text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.1]'
                    }`}
                    style={form.icon === iconName ? { backgroundColor: form.color } : undefined}
                    title={iconName}
                  >
                    {getCategoryIcon(iconName, 'w-4 h-4')}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-50 text-white text-xs font-medium shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Saving...' : formMode === 'edit' ? 'Save Changes' : 'Create Category'}</span>
            </button>
          </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
