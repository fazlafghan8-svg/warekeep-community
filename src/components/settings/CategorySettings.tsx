import React, { useMemo, useState } from 'react';
import type { CategoryIconMeta } from '../../types';
import { resolveCategoryIconMeta } from '../../utils/iconMatcher';
import type { CategoryIconColor } from '../../utils/iconDictionary';
import { CategoryIconChip } from '../ui/CategoryIconChip';
import { IconPickerModal } from '../ui/IconPickerModal';
import { SmartCategoryInput } from './SmartCategoryInput';
interface CategorySettingsProps {
    categories: string[];
    categoryIcons?: Record<string, CategoryIconMeta>;
    newCategory: string;
    setNewCategory: (value: string) => void;
    onAddCategory: (manualIcon?: CategoryIconMeta) => boolean | void;
    onDeleteCategory: (category: string) => void;
    onSetCategoryIcon?: (category: string, meta: CategoryIconMeta) => void;
    language?: 'dari' | 'english';
}
export const CategorySettings: React.FC<CategorySettingsProps> = ({ categories, categoryIcons, newCategory, setNewCategory, onAddCategory, onDeleteCategory, onSetCategoryIcon, language = 'dari' }) => {
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const normalizedCategories = useMemo(() => [...categories].sort((a, b) => a.localeCompare(b)), [categories]);
    const digitFormatter = useMemo(() => new Intl.NumberFormat(isEnglish ? 'en-US' : 'fa-AF-u-nu-arabext', { useGrouping: false }), [isEnglish]);
    const [pickerCategory, setPickerCategory] = useState<string | null>(null);
    const totalCategories = normalizedCategories.length;
    const pickerCategoryMeta = pickerCategory ? resolveCategoryIconMeta(categoryIcons, pickerCategory) : null;
    return (<div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-slate-50 p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">{tr('Expense Categories', 'دسته‌بندی مصارف')}</h3>
                        <p className="text-sm text-slate-500 mt-1">{tr('Manage categories used in expense registration and reports.', 'دسته‌هایی را مدیریت کنید که در ثبت مصارف و راپورها استفاده می‌شوند.')}</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-bold w-fit">
                        {isEnglish ? `${digitFormatter.format(totalCategories)} Active Categories` : `${digitFormatter.format(totalCategories)} دسته فعال`}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-8 space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{tr('Add New Category', 'افزودن دسته جدید')}</label>
                        <SmartCategoryInput value={newCategory} onChange={setNewCategory} onAdd={onAddCategory} language={language}/>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-black text-slate-800">{tr('Category List', 'فهرست دسته‌ها')}</h4>
                            <span className="text-xs text-slate-500">{tr('Click an icon to customize it', 'برای تغییر آیکون، روی آن کلیک کنید')}</span>
                        </div>

                        {normalizedCategories.length === 0 ? (<div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
                                {tr('No categories have been created yet.', 'هنوز هیچ دسته‌ای ایجاد نشده است.')}
                            </div>) : (<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {normalizedCategories.map((category, index) => {
                const meta = resolveCategoryIconMeta(categoryIcons, category);
                return (<div key={category} className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 hover:bg-white hover:border-slate-300 transition">
                                            <div className="flex items-center gap-2.5">
                                                <button type="button" onClick={() => setPickerCategory(category)} className="rounded-xl transition hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300" title={tr('Change icon', 'تغییر آیکون')} aria-label={tr(`Change icon for ${category}`, `تغییر آیکون ${category}`)}>
                                                    <CategoryIconChip icon={meta.icon} color={meta.color} source={meta.source} size="md" animateKey={`${meta.icon}-${meta.color}`} smartBadgeTitle={tr('Smart suggestion', 'پیشنهاد هوشمند')}/>
                                                </button>
                                                <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[11px] font-black flex items-center justify-center">
                                                    {digitFormatter.format(index + 1)}
                                                </span>
                                                <span className="font-semibold text-slate-800">{category}</span>
                                            </div>
                                            <button onClick={() => onDeleteCategory(category)} className="text-rose-600 hover:text-rose-700 text-xs font-black uppercase tracking-wide">
                                                {tr('Delete', 'حذف')}
                                            </button>
                                        </div>);
            })}
                            </div>)}
                    </div>
                </div>

                <div className="xl:col-span-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 sticky top-6">
                        <h4 className="font-black text-slate-800">{tr('Design Notes', 'یادداشت‌ها')}</h4>
                        <ul className="text-sm text-slate-600 space-y-2">
                            <li>{tr('Use concise names for cleaner reports.', 'برای راپورهای بهتر، نام‌های کوتاه و روشن استفاده کنید.')}</li>
                            <li>{tr('Icons are suggested automatically — click any icon to override it.', 'آیکون‌ها به‌صورت خودکار پیشنهاد می‌شوند — برای تغییر روی آیکون کلیک کنید.')}</li>
                            <li>{tr('Manually chosen icons are never overwritten automatically.', 'آیکون‌هایی که دستی انتخاب شوند هرگز به‌صورت خودکار بازنویسی نمی‌شوند.')}</li>
                            <li>{tr('Keep the list focused for faster daily usage.', 'فهرست دسته‌ها را محدود نگه دارید تا استفاده روزانه سریع‌تر شود.')}</li>
                        </ul>
                        <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
                            {tr('Category updates apply instantly to the expense form.', 'تغییرات دسته‌بندی فوراً در فرم مصارف اعمال می‌شود.')}
                        </div>
                    </div>
                </div>
            </div>

            <IconPickerModal isOpen={pickerCategory !== null} onClose={() => setPickerCategory(null)} onSelect={(selection: {
            icon: string;
            color: CategoryIconColor;
        }) => {
            if (pickerCategory && onSetCategoryIcon) {
                onSetCategoryIcon(pickerCategory, { icon: selection.icon, color: selection.color, source: 'manual' });
            }
        }} initialIcon={pickerCategoryMeta?.icon} initialColor={pickerCategoryMeta?.color} language={language}/>
        </div>);
};
