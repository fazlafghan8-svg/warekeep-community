import React from 'react';
import { AppSettings, InvoiceTemplateId } from '../../types';
import { isSpecialInvoiceAccount, SPECIAL_INVOICE_ACCOUNT_EMAIL } from '../../utils/invoiceDesignPolicy';
interface InvoiceDesignSettingsProps {
    formData: AppSettings;
    t: Record<string, string>;
    onUpdateForm: (updater: (prev: AppSettings) => AppSettings) => void;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'signature') => void;
    accountEmail?: string | null;
}
const inputClass = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-800 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-brand-400 focus:border-brand-300 transition';
const labelClass = 'block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5';
const cardClass = 'bg-white rounded-2xl border border-slate-200 shadow-sm';
const getDesign = (settings: AppSettings): NonNullable<AppSettings['invoiceDesign']> => settings.invoiceDesign || {};
export const InvoiceDesignSettings: React.FC<InvoiceDesignSettingsProps> = ({ formData, t, onUpdateForm, onImageUpload, accountEmail }) => {
    const isEnglish = (formData.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const design = getDesign(formData);
    const storeName = formData.storeName || tr('My Store', 'فروشگاه من');
    const primaryColor = design.primaryColor || '#63AEE3';
    const isSpecialAccount = isSpecialInvoiceAccount(accountEmail);
    const selectedTemplateId: InvoiceTemplateId = isSpecialAccount
        ? 'legacy'
        : (design.templateId === 'modern' || design.templateId === 'clean' || design.templateId === 'legacy'
            ? design.templateId
            : 'legacy');
    const templateLabel = (templateId: InvoiceTemplateId) => {
        if (templateId === 'modern')
            return tr('Modern Color', 'مدرن رنگی');
        if (templateId === 'clean')
            return tr('Clean Minimal', 'مینیمال ساده');
        return tr('Legacy Classic', 'کلاسیک قبلی');
    };
    const updateDesign = <K extends keyof NonNullable<AppSettings['invoiceDesign']>>(key: K, value: NonNullable<AppSettings['invoiceDesign']>[K]) => {
        if (isSpecialAccount && key === 'templateId') {
            return;
        }
        onUpdateForm((prev) => ({
            ...prev,
            invoiceDesign: {
                ...(prev.invoiceDesign || {}),
                [key]: value
            }
        }));
    };
    return (<div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in">
            <div className="xl:col-span-8 space-y-6">
                <div className={cardClass}>
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-black text-slate-800">{t.designInvoice || tr('Invoice Design', 'طراحی فاکتور')}</h3>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tr('Layout', 'چیدمان')}</span>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className={labelClass}>{tr('Invoice Template', 'قالب فاکتور')}</label>
                            <select value={selectedTemplateId} onChange={(e) => updateDesign('templateId', e.target.value as InvoiceTemplateId)} disabled={isSpecialAccount} className={`${inputClass} ${isSpecialAccount ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}>
                                <option value="legacy">{templateLabel('legacy')}</option>
                                <option value="modern">{templateLabel('modern')}</option>
                                <option value="clean">{templateLabel('clean')}</option>
                            </select>
                            {isSpecialAccount ? (<p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    {tr(`Special account ${SPECIAL_INVOICE_ACCOUNT_EMAIL} always uses Legacy Classic template and is protected from template updates.`, `اکانت ویژه ${SPECIAL_INVOICE_ACCOUNT_EMAIL} همیشه روی قالب کلاسیک قبلی قفل است و تغییرات قالب روی آن اعمال نمی‌شود.`)}
                                </p>) : (<p className="mt-2 text-xs text-slate-500">
                                    {tr('Choose a template for new invoice prints.', 'برای چاپ‌های جدید یکی از قالب‌ها را انتخاب کنید.')}
                                </p>)}
                        </div>
                        <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                            <span className="text-sm font-semibold text-slate-700">{t.showStoreName || tr('Show Store Name', 'نمایش نام فروشگاه')}</span>
                            <input type="checkbox" checked={design.showStoreName !== false} onChange={(e) => updateDesign('showStoreName', e.target.checked)} className="w-4 h-4"/>
                        </label>
                        <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                            <span className="text-sm font-semibold text-slate-700">{t.showWatermark || tr('Show Watermark', 'نمایش واترمارک')}</span>
                            <input type="checkbox" checked={!!design.showWatermark} onChange={(e) => updateDesign('showWatermark', e.target.checked)} className="w-4 h-4"/>
                        </label>
                        <div>
                            <label className={labelClass}>{t.paperSize || tr('Paper Size', 'اندازه کاغذ')}</label>
                            <select value={design.paperSize || 'A4'} onChange={(e) => updateDesign('paperSize', e.target.value as 'A4' | 'A5' | 'Thermal')} className={inputClass}>
                                <option value="A4">A4</option>
                                <option value="A5">A5</option>
                                <option value="Thermal">Thermal</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t.primaryColor || tr('Primary Color', 'رنگ اصلی')}</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={primaryColor} onChange={(e) => updateDesign('primaryColor', e.target.value)} className="h-11 w-14 border border-slate-200 rounded-xl bg-white"/>
                                <input type="text" value={primaryColor} onChange={(e) => updateDesign('primaryColor', e.target.value)} className={`${inputClass} font-mono`}/>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={cardClass}>
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="font-black text-slate-800">{tr('Branding Assets', 'دارایی‌های برند')}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tr('Visuals', 'بخش دیداری')}</span>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                            <label className={labelClass}>{t.uploadLogo || tr('Upload Logo', 'بارگذاری لوگو')}</label>
                            <input type="file" accept="image/*" onChange={(e) => onImageUpload(e, 'logo')} className="w-full text-sm"/>
                            <div className="mt-3 h-24 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                                {design.logo ? <img src={design.logo} alt="logo-preview" className="h-full w-full object-contain"/> : <span className="text-xs text-slate-400">{tr('No logo uploaded', 'لوگو بارگذاری نشده')}</span>}
                            </div>
                        </div>
                        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                            <label className={labelClass}>{t.uploadSignature || tr('Upload Signature', 'بارگذاری امضا')}</label>
                            <input type="file" accept="image/*" onChange={(e) => onImageUpload(e, 'signature')} className="w-full text-sm"/>
                            <div className="mt-3 h-24 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                                {design.signature ? <img src={design.signature} alt="signature-preview" className="h-full w-full object-contain"/> : <span className="text-xs text-slate-400">{tr('No signature uploaded', 'امضا بارگذاری نشده')}</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={cardClass}>
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="font-black text-slate-800">{tr('Contact & Payment Info', 'اطلاعات تماس و پرداخت')}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tr('Metadata', 'فراداده')}</span>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>{tr('Website', 'وب‌سایت')}</label>
                            <input type="text" value={design.website || ''} onChange={(e) => updateDesign('website', e.target.value)} className={inputClass} dir="ltr"/>
                        </div>
                        <div>
                            <label className={labelClass}>{tr('Email', 'ایمیل')}</label>
                            <input type="text" value={design.email || ''} onChange={(e) => updateDesign('email', e.target.value)} className={inputClass} dir="ltr"/>
                        </div>
                        <div>
                            <label className={labelClass}>{tr('Custom Phone', 'شماره سفارشی')}</label>
                            <input type="text" value={design.customPhone || ''} onChange={(e) => updateDesign('customPhone', e.target.value)} className={inputClass} dir="ltr"/>
                        </div>
                        <div>
                            <label className={labelClass}>{tr('Bank Account', 'حساب بانکی')}</label>
                            <input type="text" value={design.bankAccount || ''} onChange={(e) => updateDesign('bankAccount', e.target.value)} className={inputClass} dir="ltr"/>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClass}>{tr('Payment Details', 'جزئیات پرداخت')}</label>
                            <textarea value={design.paymentDetails || ''} onChange={(e) => updateDesign('paymentDetails', e.target.value)} className={`${inputClass} min-h-[78px]`}/>
                        </div>
                    </div>
                </div>

                <div className={cardClass}>
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="font-black text-slate-800">{tr('Terms & Footer', 'شرایط و پاورقی')}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tr('Text Blocks', 'متن‌ها')}</span>
                    </div>
                    <div className="p-5 grid grid-cols-1 gap-4">
                        <div>
                            <label className={labelClass}>{t.termsAndConditions || tr('Terms', 'شرایط')}</label>
                            <textarea value={design.terms || ''} onChange={(e) => updateDesign('terms', e.target.value)} className={`${inputClass} min-h-[88px]`}/>
                        </div>
                        <div>
                            <label className={labelClass}>{t.invoiceFooter || tr('Footer Text', 'متن پاورقی')}</label>
                            <textarea value={design.footerText || ''} onChange={(e) => updateDesign('footerText', e.target.value)} className={`${inputClass} min-h-[88px]`}/>
                        </div>
                    </div>
                </div>
            </div>

            <div className="xl:col-span-4 space-y-6">
                <div className="sticky top-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h4 className="font-black text-slate-800 mb-4">{tr('Live Preview', 'پیش‌نمایش زنده')}</h4>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: primaryColor }}>
                                <span className="font-black text-white text-sm">{tr('INVOICE', 'فاکتور')}</span>
                                <span className="text-xs text-white/90">#{formData.invoiceNumbering?.nextNumber || 1001}</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {design.showStoreName !== false && (<div className="text-sm font-bold text-slate-800">{storeName}</div>)}
                                <div className="text-xs text-slate-500">{tr('Paper', 'کاغذ')}: {design.paperSize || 'A4'}</div>
                                <div className="text-xs text-slate-500">{tr('Watermark', 'واترمارک')}: {design.showWatermark ? tr('Enabled', 'فعال') : tr('Disabled', 'غیرفعال')}</div>
                                <div className="h-px bg-slate-100"/>
                                <div className="text-xs text-slate-600 line-clamp-3">{design.footerText || tr('Footer preview...', 'پیش‌نمایش پاورقی...')}</div>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">
                        {tr('Updates here are applied to all new invoice prints.', 'تغییرات این بخش روی همه چاپ‌های جدید فاکتور اعمال می‌شود.')}
                    </p>
                </div>
            </div>
        </div>);
};
