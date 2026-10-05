import { Invoice, Customer, Medicine, AppSettings, InvoiceTemplateId } from '../types';
import { describeInvoiceItemUnit } from './unitConversion';
import { getInvoiceDisplayLines, getInvoiceDisplayLineTotal } from './invoiceBatchAllocation';
import { formatAppDate, getSalesModeLabel } from '@/lib/formatters';
import { resolveDefaultSalesMode } from '@/constants/sales';
import offlineInvoiceFont from '../assets/fonts/Vazirmatn-variable.woff2?inline';
// Embed the cleared OFL font so an exported invoice also works offline outside
// Electron. The exported document must not make requests for fonts or images.
const withCommunityInvoiceAssets = (html: string): string => {
    const offlineFontCss = `@font-face {
        font-family: 'Vazirmatn';
        src: url('${offlineInvoiceFont}') format('woff2');
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
    }
    html, body, body * { font-family: 'Vazirmatn', 'Segoe UI', Arial, sans-serif !important; }`;
    const offlinePolicy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`;
    return html.replace(/@import\s+url\([^)]*\)\s*;/gi, '')
        .replace('<head>', `<head>\n${offlinePolicy}`)
        .replace('</head>', `<style>${offlineFontCss}</style>\n</head>`);
};
const getCurrencyFractionDigits = (currency?: string) => currency === 'IRR' ? 0 : 2;
const escapeHtml = (value: unknown): string => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const sanitizeCssColor = (value: unknown, fallback = '#63AEE3') => {
    const color = String(value || '').trim();
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color) ? color : fallback;
};
const sanitizeAssetUrl = (value: unknown) => {
    const source = String(value || '').trim();
    if (!source)
        return '';
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(source))
        return source;
    return '';
};
const formatMoney = (value: unknown, currency?: string) => {
    const parsed = Number(value);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString(undefined, {
        maximumFractionDigits: getCurrencyFractionDigits(currency)
    });
};
const getSalesReturnTotals = (invoice: Invoice) => {
    const activeReturns = (invoice.returns || []).filter((entry) => !entry.isDeleted);
    return {
        count: activeReturns.length,
        subtotal: activeReturns.reduce((sum, entry) => sum + (Number(entry.subtotal) || 0), 0),
        taxRefund: activeReturns.reduce((sum, entry) => sum + (Number(entry.taxRefund) || 0), 0),
        totalRefund: activeReturns.reduce((sum, entry) => sum + (Number(entry.totalRefund) || 0), 0),
        amountRefunded: activeReturns.reduce((sum, entry) => sum + (Number(entry.amountRefunded) || 0), 0),
        debtReduction: activeReturns.reduce((sum, entry) => sum + (Number(entry.debtReduction) || 0), 0)
    };
};
const renderCompactReturnsSummary = (invoice: Invoice, labels: any, currency: string) => {
    const totals = getSalesReturnTotals(invoice);
    if (totals.count === 0)
        return '';
    return `
        <div class="row"><span>${labels.returns}</span><span>- ${formatMoney(totals.subtotal, currency)} ${escapeHtml(currency)}</span></div>
        <div class="row"><span>${labels.refunded}</span><span>${formatMoney(totals.amountRefunded, currency)} ${escapeHtml(currency)}</span></div>
        <div class="row"><span>${labels.debtReduction}</span><span>${formatMoney(totals.debtReduction, currency)} ${escapeHtml(currency)}</span></div>
    `;
};
const renderA4ReturnsSummary = (invoice: Invoice, labels: any, currency: string) => {
    const totals = getSalesReturnTotals(invoice);
    if (totals.count === 0)
        return '';
    return `
        <div class="summary-row">
            <span class="summary-label" style="color:#ef4444;">${labels.returns}</span>
            <span class="summary-value" style="color:#ef4444;">- ${formatMoney(totals.subtotal, currency)} ${escapeHtml(currency)}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">${labels.refunded}</span>
            <span class="summary-value">${formatMoney(totals.amountRefunded, currency)} ${escapeHtml(currency)}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">${labels.debtReduction}</span>
            <span class="summary-value">${formatMoney(totals.debtReduction, currency)} ${escapeHtml(currency)}</span>
        </div>
    `;
};
const renderModernReturnsSummary = (invoice: Invoice, labels: any, currency: string) => {
    const totals = getSalesReturnTotals(invoice);
    if (totals.count === 0)
        return '';
    return `
        <div class="summary-row"><span>${labels.returns}</span><strong>- ${formatMoney(totals.subtotal, currency)} ${escapeHtml(currency)}</strong></div>
        <div class="summary-row"><span>${labels.refunded}</span><strong>${formatMoney(totals.amountRefunded, currency)} ${escapeHtml(currency)}</strong></div>
        <div class="summary-row"><span>${labels.debtReduction}</span><strong>${formatMoney(totals.debtReduction, currency)} ${escapeHtml(currency)}</strong></div>
    `;
};
const generateA4Invoice = (invoice: Invoice, customer: Customer, medicines: Medicine[], settings: AppSettings, isEnglish: boolean, dir: string, textAlign: string, labels: any): string => {
    const design = settings.invoiceDesign || {};
    const logoSrc = sanitizeAssetUrl(design.logo);
    const signatureSrc = sanitizeAssetUrl(design.signature);
    const primaryColor = sanitizeCssColor(design.primaryColor, '#63AEE3');
    const currency = settings.currencySettings?.baseCurrency || 'AFN';
    const paperSize = design.paperSize || 'A4';
    const showStoreName = design.showStoreName !== false;
    // Payment Status Logic
    let paymentStatusLabel = '';
    if (invoice.paymentStatus === 'card') {
        paymentStatusLabel = isEnglish ? 'Paid (Card)' : 'پرداخت کارت';
    }
    else if (invoice.paymentStatus === 'mixed') {
        paymentStatusLabel = isEnglish ? 'Paid (Mixed)' : 'پرداخت ترکیبی';
    }
    else if (invoice.paymentStatus === 'paid' || (invoice.amountPaid >= invoice.finalAmount && invoice.finalAmount > 0)) {
        paymentStatusLabel = isEnglish ? 'Paid (Cash)' : 'نقدی (تسویه)';
    }
    else if (invoice.paymentStatus === 'credit' || invoice.amountPaid === 0) {
        paymentStatusLabel = isEnglish ? 'Credit (Unpaid)' : 'نسیه (باقی‌دار)';
    }
    else {
        paymentStatusLabel = isEnglish ? 'Partial Payment' : 'پرداخت جزئی';
    }
    // Icons with specific requested color #63AEE3
    const iconColor = "#63AEE3";
    const icons = {
        location: `<svg width="14" height="14" viewBox="0 0 24 24" fill="${iconColor}" style="display:inline-block; vertical-align:middle; margin-bottom:2px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
        phone: `<svg width="14" height="14" viewBox="0 0 24 24" fill="${iconColor}" style="display:inline-block; vertical-align:middle; margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`,
        web: `<svg width="14" height="14" viewBox="0 0 24 24" fill="${iconColor}" style="display:inline-block; vertical-align:middle; margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
        email: `<svg width="14" height="14" viewBox="0 0 24 24" fill="${iconColor}" style="display:inline-block; vertical-align:middle; margin-bottom:2px;"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`
    };
    const invoiceDate = formatAppDate(invoice.date, settings, 'sales', { day: 'numeric', month: 'long', year: 'numeric' });
    const invoiceNumber = invoice.invoiceNumber ? String(invoice.invoiceNumber) : invoice.id.replace(/\D/g, '').slice(-6);
    const salesModeLabel = escapeHtml(getSalesModeLabel(invoice.salesMode || resolveDefaultSalesMode(settings), settings.language || 'dari'));
    const seller = settings.users?.find(u => u.id === invoice.userId);
    const sellerName = seller ? seller.name : (invoice.userId === 'admin' ? (isEnglish ? 'System Admin' : 'مدیر سیستم') : '---');
    const safeStoreName = escapeHtml(settings.storeName);
    const safeStoreInitial = escapeHtml((settings.storeName || 'S').charAt(0));
    const safeStoreAddress = escapeHtml(settings.storeAddress);
    const safeStorePhone = escapeHtml(design.customPhone || settings.storePhone);
    const safeCustomerName = escapeHtml(customer.name);
    const safeCustomerPhone = escapeHtml(customer.phone);
    const safeSellerName = escapeHtml(sellerName);
    const safeWebsite = escapeHtml(design.website);
    const safeEmail = escapeHtml(design.email);
    const safeBankAccount = escapeHtml(design.bankAccount);
    const safePaymentDetails = escapeHtml(design.paymentDetails);
    const safeTerms = escapeHtml(design.terms);
    const safeFooterText = escapeHtml(design.footerText || (isEnglish ? 'Thank you for your business!' : 'از خرید شما سپاسگزاریم.'));
    const safePaymentStatusLabel = escapeHtml(paymentStatusLabel);
    let itemsRows = '';
    // Ensure we have exactly 12 rows structure or more if needed, but optimized for 12 on A4
    const ROW_COUNT = 12;
    const itemsToRender = getInvoiceDisplayLines(invoice.items || []);
    // Fill remaining rows with empty data to maintain layout height if items < 12
    if (paperSize === 'A4' && itemsToRender.length < ROW_COUNT) {
        const remaining = ROW_COUNT - itemsToRender.length;
        for (let i = 0; i < remaining; i++) {
            itemsToRender.push(null as any);
        }
    }
    itemsToRender.forEach((item, index) => {
        // Alternating row colors
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8fbfc';
        if (item) {
            const displayLine = item;
            const invoiceItem = displayLine.item;
            const med = medicines.find(m => m.id === invoiceItem.medicineId);
            const name = escapeHtml(med ? med.name : 'Unknown Item');
            const itemTotal = getInvoiceDisplayLineTotal(displayLine, currency as any);
            itemsRows += `
            <tr style="background-color: ${bgColor}; height: 32px;">
                <td style="padding: 4px 12px; text-align: ${textAlign}; border-bottom: 1px solid #eef2f6; color: #374151; font-weight: 500; font-size: 11px;">
                    ${index + 1}. ${name}
                </td>
                <td style="padding: 4px 12px; text-align: center; border-bottom: 1px solid #eef2f6; color: #4b5563; font-size: 11px;">
                    ${formatMoney(invoiceItem.price, currency)}
                </td>
                <td style="padding: 4px 12px; text-align: center; border-bottom: 1px solid #eef2f6; color: #4b5563; font-size: 11px;">
                    ${escapeHtml(`${invoiceItem.quantity} ${describeInvoiceItemUnit(invoiceItem, settings.language === 'english')}`)}
                </td>
                <td style="padding: 4px 12px; text-align: center; border-bottom: 1px solid #eef2f6; color: #111827; font-weight: 700; font-size: 11px;">
                    ${formatMoney(itemTotal, currency)}
                </td>
            </tr>`;
        }
        else {
            // Empty Row
            itemsRows += `
            <tr style="background-color: ${bgColor}; height: 32px;">
                <td style="padding: 4px 12px; border-bottom: 1px solid #eef2f6;">&nbsp;</td>
                <td style="border-bottom: 1px solid #eef2f6;"></td>
                <td style="border-bottom: 1px solid #eef2f6;"></td>
                <td style="border-bottom: 1px solid #eef2f6;"></td>
            </tr>`;
        }
    });
    // Reduce height slightly from 297mm to prevent double page
    // Updated padding to 25px 40px for better fit
    const containerStyle = paperSize === 'A5'
        ? 'width: 148mm; height: 209mm; padding: 15px 20px;'
        : 'width: 210mm; height: 296mm; padding: 25px 40px;';
    const titleSize = paperSize === 'A5' ? '28px' : '42px';
    const bodyFontSize = paperSize === 'A5' ? '10px' : '12px';
    return `
<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fa'}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <title>Invoice #${invoiceNumber}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;700;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');
        
        @page { size: ${paperSize}; margin: 0; }
        
        html, body {
            margin: 0; padding: 0;
            width: 100%;
            height: ${paperSize === 'A5' ? '209mm' : '296mm'}; /* Locked Height */
            overflow: hidden; /* Prevent Overflow */
            font-family: ${isEnglish ? "'Poppins', sans-serif" : "'Vazirmatn', sans-serif"}; 
            background: #fff; color: #333;
            font-size: ${bodyFontSize};
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        .container {
            ${containerStyle}
            margin: 0 auto;
            box-sizing: border-box;
            position: relative;
            z-index: 1;
            display: flex; flex-direction: column;
            overflow: hidden; /* Prevent Overflow */
        }
        
        /* HEADER */
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            margin-bottom: 25px; 
        }
        
        .company-logo { 
            max-width: ${showStoreName ? '150px' : '300px'}; 
            max-height: ${showStoreName ? '80px' : '150px'}; 
            width: auto; height: auto;
            object-fit: contain; margin-bottom: 5px; display: block;
        }
        
        .company-logo-placeholder { 
            width: 60px; height: 60px; 
            background: ${primaryColor}; 
            border-radius: 12px; display: flex; 
            align-items: center; justify-content: center; 
            color: white; font-weight: bold; font-size: 24px;
            margin-bottom: 5px;
        }
        
        .company-name { font-weight: 800; font-size: 22px; color: #1f2937; text-transform: uppercase; margin: 0; line-height: 1.2; }
        .company-tagline { font-size: 10px; color: #6b7280; margin-top: 2px; }

        .invoice-title-block { text-align: ${isEnglish ? 'right' : 'left'}; }
        .invoice-main-title { font-size: ${titleSize}; font-weight: 900; color: ${primaryColor}; margin: 0; line-height: 1; text-transform: uppercase; letter-spacing: 1px; }
        .invoice-sub-no { font-size: 14px; color: #4b5563; margin-top: 4px; font-weight: 600; letter-spacing: 1px; }

        /* INFO GRID */
        .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-end; }
        
        .bill-to { flex: 1; }
        .bill-to-label { font-size: 10px; color: #9ca3af; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; display: block; letter-spacing: 0.5px; }
        .customer-name { font-size: 18px; font-weight: 800; color: #111; margin: 0 0 2px 0; }
        .customer-address { font-size: 11px; color: #4b5563; line-height: 1.4; max-width: 280px; font-family: sans-serif; }

        .invoice-meta { text-align: ${isEnglish ? 'right' : 'left'}; }
        .meta-row { margin-bottom: 4px; font-size: 11px; color: #374151; }
        .meta-label { font-weight: 600; color: #6b7280; margin-${isEnglish ? 'right' : 'left'}: 8px; }
        .meta-value { font-weight: 700; color: #1f2937; }
        
        /* TOTAL DUE BIG DISPLAY */
        .total-due-box {
            margin-top: 10px;
            background: linear-gradient(to right, ${primaryColor}15, transparent);
            padding: 8px 15px;
            border-radius: 8px;
            border-${isEnglish ? 'left' : 'right'}: 4px solid ${primaryColor};
            display: inline-block;
        }
        .total-due-label { font-size: 10px; color: ${primaryColor}; font-weight: 800; text-transform: uppercase; }
        .total-due-value { font-size: 24px; font-weight: 900; color: #1f2937; line-height: 1; }

        /* TABLE */
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { 
            background-color: ${primaryColor}; 
            color: white; 
            padding: 10px 12px; 
            font-size: 11px; 
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        /* Rounded Headers */
        th:first-child { border-top-${isEnglish ? 'left' : 'right'}-radius: 6px; border-bottom-${isEnglish ? 'left' : 'right'}-radius: 6px; text-align: ${textAlign}; }
        th:last-child { border-top-${isEnglish ? 'right' : 'left'}-radius: 6px; border-bottom-${isEnglish ? 'right' : 'left'}-radius: 6px; }

        /* FOOTER GRID */
        .footer-grid { display: flex; justify-content: space-between; align-items: flex-start; margin-top: auto; padding-top: 10px; border-top: 2px dashed #f3f4f6; }
        .footer-left { width: 55%; padding-${isEnglish ? 'right' : 'left'}: 20px; }
        .footer-right { width: 40%; }

        .section-title { font-size: 11px; font-weight: 800; color: #1f2937; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
        .section-text { font-size: 10px; color: #6b7280; line-height: 1.5; margin-bottom: 15px; text-align: justify; }

        .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 11px; color: #4b5563; }
        .summary-row:last-child { border-bottom: none; }
        .summary-label { font-weight: 500; }
        .summary-value { font-weight: 700; color: #1f2937; }

        .grand-total-box {
            background-color: ${primaryColor};
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 12px;
            box-shadow: 0 4px 10px -2px rgba(0,0,0,0.15);
        }
        .grand-total-label { font-size: 12px; font-weight: 700; text-transform: uppercase; }
        .grand-total-value { font-size: 16px; font-weight: 900; }

        /* BOTTOM SECTION (Signature & Contacts) */
        .bottom-section { 
            display: flex; justify-content: space-between; align-items: flex-end;
            margin-top: 15px;
            position: relative;
            z-index: 2;
        }
        
        .contacts { font-size: 10px; color: #6b7280; width: 60%; }
        .contact-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .contact-icon { display: flex; align-items: center; justify-content: center; width: 16px; }

        .signature-box { text-align: center; width: 180px; }
        .signature-img { 
            font-family: 'Dancing Script', 'Brush Script MT', cursive; 
            font-size: 24px; color: #1f2937; margin-bottom: 2px; 
            line-height: 1; font-weight: 700; transform: rotate(-3deg);
            display: inline-block; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; width: 100%;
        }
        .signature-title { font-size: 9px; color: #9ca3af; text-transform: uppercase; margin-top: 4px; letter-spacing: 1px; font-weight: 600; }

        /* DECORATION */
        .bubbles {
            position: absolute; bottom: -60px; ${isEnglish ? 'right: -60px;' : 'left: -60px;'}
            width: 350px; height: 350px; z-index: -1; opacity: 0.6; pointer-events: none;
        }
        .bubble-1 { fill: ${primaryColor}; opacity: 0.08; }
        .bubble-2 { fill: #10b981; opacity: 0.08; }
        .bubble-3 { fill: #3b82f6; opacity: 0.08; }
        
        .watermark {
            position: absolute; top: 45%; left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80px; font-weight: 900; color: #f3f4f6;
            z-index: 0; pointer-events: none; opacity: 0.5;
            text-transform: uppercase; white-space: nowrap;
        }
    </style>
</head>
<body>
    ${design.showWatermark ? `<div class="watermark">${safeStoreName}</div>` : ''}
    
    <svg class="bubbles" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
        <circle cx="400" cy="400" r="140" class="bubble-1" />
        <circle cx="200" cy="450" r="80" class="bubble-2" />
        <circle cx="450" cy="250" r="60" class="bubble-3" />
        <circle cx="350" cy="350" r="40" class="bubble-1" style="opacity: 0.2" />
    </svg>

    <div class="container">
        <!-- HEADER -->
        <div class="header">
            <div>
                ${logoSrc
        ? `<img src="${escapeHtml(logoSrc)}" class="company-logo" />`
        : `<div class="company-logo-placeholder">${safeStoreInitial}</div>`}
                ${showStoreName ? `<h1 class="company-name">${safeStoreName}</h1>` : ''}
            </div>
            <div class="invoice-title-block">
                <h2 class="invoice-main-title">INVOICE</h2>
                <div class="invoice-sub-no">${labels.invoiceNo} #${invoiceNumber}</div>
            </div>
        </div>

        <!-- INFO GRID -->
        <div class="info-grid">
            <div class="bill-to">
                <span class="bill-to-label">${labels.customer}:</span>
                <h3 class="customer-name">${safeCustomerName}</h3>
                <div class="customer-address" dir="ltr">${safeCustomerPhone}</div>
            </div>
            
            <div class="invoice-meta">
                <div class="meta-row">
                    <span class="meta-label">${isEnglish ? 'Date' : 'تاریخ صدور'}:</span>
                    <span class="meta-value">${invoiceDate}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">${isEnglish ? 'Payment Status' : 'وضعیت پرداخت'}:</span>
                    <span class="meta-value">${safePaymentStatusLabel}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">${labels.salesMode}:</span>
                    <span class="meta-value">${salesModeLabel}</span>
                </div>
                
                <div class="total-due-box">
                    <div class="total-due-label">${labels.finalAmount}</div>
                    <div class="total-due-value">${formatMoney(invoice.finalAmount, currency)} <small style="font-size:12px; font-weight:600;">${escapeHtml(currency)}</small></div>
                </div>
            </div>
        </div>

        <!-- TABLE -->
        <table>
            <thead>
                <tr>
                    <th style="width: 45%;">${labels.itemDesc}</th>
                    <th style="text-align: center;">${labels.price}</th>
                    <th style="text-align: center;">${labels.qty}</th>
                    <th style="text-align: center;">${labels.total} (${escapeHtml(currency)})</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>

        <!-- FOOTER -->
        <div class="footer-grid">
            <div class="footer-left">
                ${design.bankAccount ? `
                <div style="margin-bottom: 15px;">
                    <h4 class="section-title">Payment Info / اطلاعات حساب:</h4>
                    <p class="section-text" style="font-family: monospace;">${safeBankAccount}</p>
                </div>` : ''}
                
                ${design.paymentDetails ? `
                <div style="margin-bottom: 15px;">
                    <h4 class="section-title">Payment Method / روش پرداخت:</h4>
                    <p class="section-text">${safePaymentDetails}</p>
                </div>` : ''}
                
                ${design.terms ? `
                <div>
                    <h4 class="section-title">${labels.terms}:</h4>
                    <p class="section-text">${safeTerms}</p>
                </div>` : ''}

                <div style="margin-top: 15px;">
                     <h4 class="section-title" style="margin-bottom:2px;">${labels.invoiceFooter}:</h4>
                     <p class="section-text" style="font-style: italic;">${safeFooterText}</p>
                </div>
            </div>
            
            <div class="footer-right">
                <div class="summary-row">
                    <span class="summary-label">${labels.subTotal}</span>
                    <span class="summary-value">${formatMoney(invoice.total, currency)}</span>
                </div>
                ${invoice.tax > 0 ? `
                <div class="summary-row">
                    <span class="summary-label">${labels.tax} (${escapeHtml(settings.taxRate)}%)</span>
                    <span class="summary-value">${formatMoney(invoice.tax, currency)}</span>
                </div>` : ''}
                ${(invoice.discount + (invoice.lineDiscountTotal || 0)) > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color:#ef4444;">${labels.discount}</span>
                    <span class="summary-value" style="color:#ef4444;">- ${formatMoney(invoice.discount + (invoice.lineDiscountTotal || 0), currency)}</span>
                </div>` : ''}
                ${renderA4ReturnsSummary(invoice, labels, currency)}
                
                <div class="grand-total-box">
                    <span class="grand-total-label">${labels.grandTotal}</span>
                    <span class="grand-total-value">${formatMoney(invoice.finalAmount, currency)} <span style="font-size:10px;">${escapeHtml(currency)}</span></span>
                </div>
            </div>
        </div>

        <!-- BOTTOM CONTACT & SIGNATURE -->
        <div class="bottom-section">
            <div class="contacts">
                <div class="contact-row">
                    <span class="contact-icon">${icons.location}</span>
                    <span>${safeStoreAddress}</span>
                </div>
                <div class="contact-row">
                    <span class="contact-icon">${icons.phone}</span>
                    <span dir="ltr" style="font-family: sans-serif;">${safeStorePhone}</span>
                </div>
                ${design.website ? `
                <div class="contact-row">
                    <span class="contact-icon">${icons.web}</span>
                    <span>${safeWebsite}</span>
                </div>` : ''}
                ${design.email ? `
                <div class="contact-row">
                    <span class="contact-icon">${icons.email}</span>
                    <span>${safeEmail}</span>
                </div>` : ''}
            </div>
            
            <div class="signature-box">
                ${signatureSrc
        ? `<img src="${escapeHtml(signatureSrc)}" style="height: 40px; margin-bottom: 5px; object-fit:contain;" />`
        : `<div class="signature-img">${safeSellerName}</div>`}
                <div class="signature-title">${labels.signature}</div>
            </div>
        </div>
    </div>
</body>
</html>`;
};
const generateThermalInvoice = (invoice: Invoice, customer: Customer, medicines: Medicine[], settings: AppSettings, isEnglish: boolean, dir: string, textAlign: string, labels: any): string => {
    const invoiceDate = formatAppDate(invoice.date, settings, 'sales');
    const invoiceNumber = invoice.invoiceNumber ? String(invoice.invoiceNumber) : invoice.id.replace(/\D/g, '').slice(-6);
    const salesModeLabel = escapeHtml(getSalesModeLabel(invoice.salesMode || resolveDefaultSalesMode(settings), settings.language || 'dari'));
    const currency = settings.currencySettings?.baseCurrency || 'AFN';
    const safeStoreName = escapeHtml(settings.storeName);
    const safeCustomerName = escapeHtml(customer.name);
    const safeFooterText = escapeHtml(settings.invoiceDesign?.footerText || 'از خرید شما متشکریم!');
    let itemsRows = '';
    getInvoiceDisplayLines(invoice.items || []).forEach((displayLine) => {
        const item = displayLine.item;
        const med = medicines.find(m => m.id === item.medicineId);
        const name = escapeHtml(med ? med.name : 'Item');
        const itemTotal = getInvoiceDisplayLineTotal(displayLine, currency as any);
        itemsRows += `
        <tr class="item-row">
            <td colspan="4" class="item-name" style="padding-top: 8px;">${name}</td>
        </tr>
        <tr class="item-details">
            <td style="padding-bottom: 5px; border-bottom: 1px solid #eee;">${escapeHtml(`${item.quantity} ${describeInvoiceItemUnit(item, settings.language === 'english')}`)} x ${formatMoney(item.price, currency)}</td>
            <td style="padding-bottom: 5px; border-bottom: 1px solid #eee; text-align: ${isEnglish ? 'right' : 'left'}; font-weight: bold;">${formatMoney(itemTotal, currency)} ${escapeHtml(currency)}</td>
        </tr>`;
    });
    return `
<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fa'}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <title>Receipt #${invoiceNumber}</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Tahoma', sans-serif; background: #fff; color: #000; font-size: 12px; }
        .ticket { width: 78mm; max-width: 78mm; margin: 0 auto; padding: 10px; }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
        .store-name { font-size: 18px; font-weight: bold; margin: 0; text-transform: uppercase; }
        .meta { font-size: 10px; margin-top: 2px; color: #333; }
        table { width: 100%; border-collapse: collapse; }
        .item-name { font-weight: bold; font-size: 11px; }
        .totals { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .total-row { font-weight: bold; font-size: 16px; margin-top: 8px; border-top: 1px solid #000; padding-top: 5px; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="ticket">
        <div class="header">
            <p class="store-name">${safeStoreName}</p>
            <p class="meta">#${invoiceNumber} | ${invoiceDate}</p>
            <p class="meta">${labels.salesMode}: ${salesModeLabel}</p>
            ${customer.name ? `<p class="meta">Customer: ${safeCustomerName}</p>` : ''}
        </div>
        <table><tbody>${itemsRows}</tbody></table>
        <div class="totals">
            <div class="row"><span>${labels.total}</span><span>${formatMoney(invoice.total, currency)} ${escapeHtml(currency)}</span></div>
            ${(invoice.discount + (invoice.lineDiscountTotal || 0)) > 0 ? `<div class="row"><span>${labels.discount}</span><span>-${formatMoney(invoice.discount + (invoice.lineDiscountTotal || 0), currency)} ${escapeHtml(currency)}</span></div>` : ''}
            ${renderCompactReturnsSummary(invoice, labels, currency)}
            <div class="row total-row"><span>${labels.grandTotal}</span><span>${formatMoney(invoice.finalAmount, currency)} ${escapeHtml(currency)}</span></div>
        </div>
        <div class="footer"><p>${safeFooterText}</p></div>
    </div>
</body>
</html>`;
};
const resolveTemplateId = (settings: AppSettings): InvoiceTemplateId => {
    const templateId = settings.invoiceDesign?.templateId;
    if (templateId === 'modern' || templateId === 'clean' || templateId === 'legacy') {
        return templateId;
    }
    return 'legacy';
};
const generateTemplateA4Invoice = (invoice: Invoice, customer: Customer, medicines: Medicine[], settings: AppSettings, isEnglish: boolean, dir: string, textAlign: string, labels: any, templateId: 'modern' | 'clean'): string => {
    const design = settings.invoiceDesign || {};
    const primaryColor = sanitizeCssColor(design.primaryColor, '#63AEE3');
    const currency = settings.currencySettings?.baseCurrency || 'AFN';
    const logoSrc = sanitizeAssetUrl(design.logo);
    const signatureSrc = sanitizeAssetUrl(design.signature);
    const pageSize = design.paperSize === 'A5' ? 'A5' : 'A4';
    const pageWidth = pageSize === 'A5' ? '148mm' : '210mm';
    const pageHeight = pageSize === 'A5' ? '209mm' : '297mm';
    const pagePadding = pageSize === 'A5' ? '16px 18px' : '24px 28px';
    const isModern = templateId === 'modern';
    const surfaceTone = isModern ? '#f8fbff' : '#ffffff';
    const panelTone = isModern ? '#eef5ff' : '#f8fafc';
    const borderTone = isModern ? '#d9e7ff' : '#e2e8f0';
    const headingColor = isModern ? '#0f172a' : '#111827';
    const accentTone = isModern ? primaryColor : '#111827';
    const softAccent = isModern ? `${primaryColor}22` : '#f1f5f9';
    const invoiceDate = formatAppDate(invoice.date, settings, 'sales');
    const invoiceNumber = invoice.invoiceNumber ? String(invoice.invoiceNumber) : invoice.id.replace(/\D/g, '').slice(-6);
    const salesModeLabel = escapeHtml(getSalesModeLabel(invoice.salesMode || resolveDefaultSalesMode(settings), settings.language || 'dari'));
    const showStoreName = design.showStoreName !== false;
    const seller = settings.users?.find((u) => u.id === invoice.userId);
    const sellerName = seller ? seller.name : (invoice.userId === 'admin' ? (isEnglish ? 'System Admin' : 'مدیر سیستم') : '---');
    const customPhone = design.customPhone || settings.storePhone || '-';
    const safeSellerName = escapeHtml(sellerName);
    const safeStoreName = escapeHtml(settings.storeName);
    const safeStoreInitial = escapeHtml((settings.storeName || 'S').charAt(0));
    const safeStoreAddress = escapeHtml(settings.storeAddress || '-');
    const safeCustomPhone = escapeHtml(customPhone);
    const safeCustomerName = escapeHtml(customer.name || '-');
    const safeCustomerPhone = escapeHtml(customer.phone || '-');
    const safeWebsiteOrAddress = escapeHtml(design.website || settings.storeAddress || '');
    const safeEmail = escapeHtml(design.email);
    const safeTerms = escapeHtml(design.terms || (isEnglish ? 'Thank you for your purchase.' : 'از خرید شما سپاسگزاریم.'));
    const safeFooterText = escapeHtml(design.footerText || (isEnglish ? 'Thank you for your business!' : 'از خرید شما متشکریم!'));
    let paymentStatusLabel = '';
    if (invoice.paymentStatus === 'card') {
        paymentStatusLabel = isEnglish ? 'Card' : 'کارت';
    }
    else if (invoice.paymentStatus === 'mixed') {
        paymentStatusLabel = isEnglish ? 'Mixed' : 'ترکیبی';
    }
    else if (invoice.paymentStatus === 'paid' || (invoice.amountPaid >= invoice.finalAmount && invoice.finalAmount > 0)) {
        paymentStatusLabel = isEnglish ? 'Paid' : 'پرداخت شد';
    }
    else if (invoice.paymentStatus === 'credit' || invoice.amountPaid === 0) {
        paymentStatusLabel = isEnglish ? 'Credit' : 'نسیه';
    }
    else {
        paymentStatusLabel = isEnglish ? 'Partial' : 'پرداخت جزئی';
    }
    const itemRows = getInvoiceDisplayLines(invoice.items || []).map((displayLine, index) => {
        const item = displayLine.item;
        const med = medicines.find((m) => m.id === item.medicineId);
        const medName = escapeHtml(med ? med.name : (isEnglish ? 'Unknown item' : 'قلم نامشخص'));
        const lineTotal = getInvoiceDisplayLineTotal(displayLine, currency as any);
        const rowBg = index % 2 === 0 ? '#ffffff' : panelTone;
        return `
            <tr style="background:${rowBg};">
                <td style="padding:9px 10px; border-bottom:1px solid ${borderTone}; text-align:${textAlign}; font-weight:600; color:${headingColor};">${index + 1}. ${medName}</td>
                <td style="padding:9px 10px; border-bottom:1px solid ${borderTone}; text-align:center;">${escapeHtml(`${item.quantity} ${describeInvoiceItemUnit(item, settings.language === 'english')}`)}</td>
                <td style="padding:9px 10px; border-bottom:1px solid ${borderTone}; text-align:center;">${formatMoney(item.price, currency)}</td>
                <td style="padding:9px 10px; border-bottom:1px solid ${borderTone}; text-align:center; font-weight:700;">${formatMoney(lineTotal, currency)}</td>
            </tr>
        `;
    }).join('');
    const normalizedRows = itemRows || `
        <tr>
            <td colspan="4" style="padding:14px 10px; text-align:center; color:#64748b; border-bottom:1px solid ${borderTone};">
                ${isEnglish ? 'No invoice lines' : 'قلمی ثبت نشده است'}
            </td>
        </tr>
    `;
    return `
<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fa'}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <title>Invoice #${invoiceNumber}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;600;700;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&display=swap');
        @page { size: ${pageSize}; margin: 0; }
        body {
            margin: 0;
            padding: 0;
            font-family: ${isEnglish ? "'Inter', sans-serif" : "'Vazirmatn', sans-serif"};
            background: ${surfaceTone};
            color: #334155;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .sheet {
            width: ${pageWidth};
            min-height: ${pageHeight};
            box-sizing: border-box;
            margin: 0 auto;
            padding: ${pagePadding};
            background: ${surfaceTone};
            position: relative;
        }
        .hero {
            border: 1px solid ${borderTone};
            border-radius: 16px;
            padding: 16px;
            background: ${isModern ? `linear-gradient(130deg, ${softAccent}, #ffffff)` : '#ffffff'};
            display: flex;
            justify-content: space-between;
            gap: 18px;
            align-items: flex-start;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand-logo {
            width: 56px;
            height: 56px;
            border-radius: 14px;
            background: ${softAccent};
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-weight: 900;
            color: ${accentTone};
            border: 1px solid ${borderTone};
        }
        .brand-logo img { width: 100%; height: 100%; object-fit: contain; }
        .store-name { margin: 0; font-size: 18px; color: ${headingColor}; font-weight: 800; }
        .store-subtitle { margin: 4px 0 0 0; font-size: 11px; color: #64748b; }
        .invoice-chip {
            background: ${accentTone};
            color: #fff;
            border-radius: 999px;
            padding: 8px 14px;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.03em;
        }
        .meta-grid {
            margin-top: 14px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .meta-cell {
            border: 1px solid ${borderTone};
            background: #fff;
            border-radius: 12px;
            padding: 10px;
        }
        .meta-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .meta-value { font-size: 13px; color: ${headingColor}; font-weight: 700; margin-top: 3px; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
            border: 1px solid ${borderTone};
            border-radius: 14px;
            overflow: hidden;
        }
        th {
            background: ${isModern ? accentTone : '#0f172a'};
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 10px;
        }
        .summary {
            margin-top: 14px;
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
            border: 1px solid ${borderTone};
            border-radius: 14px;
            padding: 12px;
            background: #fff;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #475569;
        }
        .summary-total {
            margin-top: 6px;
            border-top: 1px dashed ${borderTone};
            padding-top: 9px;
            font-size: 15px;
            font-weight: 900;
            color: ${headingColor};
            display: flex;
            justify-content: space-between;
        }
        .footer-grid {
            margin-top: 14px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .box {
            border: 1px solid ${borderTone};
            border-radius: 12px;
            padding: 10px;
            background: #fff;
            min-height: 72px;
        }
        .box-title {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 5px;
        }
        .box-text { font-size: 11px; color: #475569; line-height: 1.5; }
        .signature {
            margin-top: 10px;
            text-align: center;
            font-size: 11px;
            color: #64748b;
        }
        .signature-name {
            display: inline-block;
            min-width: 140px;
            padding-bottom: 4px;
            border-bottom: 1px solid ${borderTone};
            font-weight: 700;
            color: ${headingColor};
            margin-bottom: 5px;
        }
        .template-tag {
            margin-top: 10px;
            text-align: center;
            font-size: 10px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="sheet">
        <div class="hero">
            <div>
                <div class="brand">
                    <div class="brand-logo">
                        ${logoSrc
        ? `<img src="${escapeHtml(logoSrc)}" alt="store-logo" />`
        : `${safeStoreInitial}`}
                    </div>
                    <div>
                        ${showStoreName ? `<h1 class="store-name">${safeStoreName}</h1>` : ''}
                        <p class="store-subtitle">${safeWebsiteOrAddress}</p>
                    </div>
                </div>
            </div>
            <div class="invoice-chip">${labels.invoiceNo} #${invoiceNumber}</div>
        </div>

        <div class="meta-grid">
            <div class="meta-cell">
                <div class="meta-label">${labels.customer}</div>
                <div class="meta-value">${safeCustomerName}</div>
                <div class="box-text" dir="ltr">${safeCustomerPhone}</div>
            </div>
            <div class="meta-cell">
                <div class="meta-label">${labels.date}</div>
                <div class="meta-value">${invoiceDate}</div>
                <div class="box-text">${labels.salesMode}: ${salesModeLabel}</div>
                <div class="box-text">${isEnglish ? 'Status' : 'وضعیت'}: ${escapeHtml(paymentStatusLabel)}</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width:45%; text-align:${textAlign};">${labels.itemDesc}</th>
                    <th>${labels.qty}</th>
                    <th>${labels.price}</th>
                    <th>${labels.total} (${escapeHtml(currency)})</th>
                </tr>
            </thead>
            <tbody>
                ${normalizedRows}
            </tbody>
        </table>

        <div class="summary">
            <div class="summary-row"><span>${labels.subTotal}</span><strong>${formatMoney(invoice.total, currency)} ${escapeHtml(currency)}</strong></div>
            ${invoice.tax > 0 ? `<div class="summary-row"><span>${labels.tax} (${escapeHtml(settings.taxRate)}%)</span><strong>${formatMoney(invoice.tax, currency)} ${escapeHtml(currency)}</strong></div>` : ''}
            ${(invoice.discount + (invoice.lineDiscountTotal || 0)) > 0 ? `<div class="summary-row"><span>${labels.discount}</span><strong>- ${formatMoney(invoice.discount + (invoice.lineDiscountTotal || 0), currency)} ${escapeHtml(currency)}</strong></div>` : ''}
            ${renderModernReturnsSummary(invoice, labels, currency)}
            <div class="summary-total"><span>${labels.grandTotal}</span><span>${formatMoney(invoice.finalAmount, currency)} ${escapeHtml(currency)}</span></div>
        </div>

        <div class="footer-grid">
            <div class="box">
                <div class="box-title">${isEnglish ? 'Contact' : 'اطلاعات تماس'}</div>
                <div class="box-text">${safeStoreAddress}</div>
                <div class="box-text" dir="ltr">${safeCustomPhone}</div>
                ${design.email ? `<div class="box-text" dir="ltr">${safeEmail}</div>` : ''}
            </div>
            <div class="box">
                <div class="box-title">${labels.terms}</div>
                <div class="box-text">${safeTerms}</div>
            </div>
        </div>

        <div class="signature">
            ${signatureSrc
        ? `<img src="${escapeHtml(signatureSrc)}" alt="signature" style="height: 36px; object-fit: contain;" />`
        : `<span class="signature-name">${safeSellerName}</span>`}
            <div>${labels.signature}</div>
        </div>
        <div class="template-tag">${isEnglish ? 'Template' : 'قالب'}: ${templateId === 'modern' ? (isEnglish ? 'Modern Color' : 'مدرن رنگی') : (isEnglish ? 'Clean Minimal' : 'مینیمال ساده')}</div>
        <div class="template-tag">${safeFooterText}</div>
    </div>
</body>
</html>`;
};
export const generateInvoiceHTML = (invoice: Invoice, customer: Customer, medicines: Medicine[], settings: AppSettings): string => {
    const lang = settings.language || 'dari';
    const isEnglish = lang === 'english';
    const dir = isEnglish ? 'ltr' : 'rtl';
    const textAlign = isEnglish ? 'left' : 'right';
    const t = {
        invoice: isEnglish ? 'INVOICE' : 'فاکتور فروش',
        invoiceNo: isEnglish ? 'Invoice No' : 'شماره فاکتور',
        date: isEnglish ? 'Date' : 'تاریخ',
        customer: isEnglish ? 'Customer' : 'مشتری',
        itemDesc: isEnglish ? 'Description' : 'شرح کالا',
        price: isEnglish ? 'Price' : 'فی واحد',
        qty: isEnglish ? 'Qty' : 'تعداد',
        total: isEnglish ? 'Total' : 'مجموع',
        subTotal: isEnglish ? 'Sub Total' : 'جمع کل',
        discount: isEnglish ? 'Discount' : 'تخفیف',
        grandTotal: isEnglish ? 'Grand Total' : 'قابل پرداخت',
        terms: isEnglish ? 'Terms' : 'شرایط و مقررات',
        signature: isEnglish ? 'Authorized Signature' : 'مهر و امضا مدیر',
        phoneNumber: isEnglish ? 'Phone' : 'شماره تماس',
        invoiceFooter: isEnglish ? 'Footer Note' : 'یادداشت',
        tax: isEnglish ? 'Tax' : 'مالیات',
        salesMode: isEnglish ? 'Sales Mode' : 'نوع فروش',
        finalAmount: isEnglish ? 'Final Amount' : 'مبلغ نهایی',
        returns: isEnglish ? 'Sales Returns' : 'برگشتی فروش',
        refunded: isEnglish ? 'Refunded' : 'برگشت پول',
        debtReduction: isEnglish ? 'Debt Reduced' : 'کاهش بدهی'
    };
    // If thermal size selected OR invoice mode is retail (and not overridden by A4 setting)
    const isThermal = settings.invoiceDesign?.paperSize === 'Thermal' || (invoice.salesMode === 'retail' && settings.invoiceDesign?.paperSize !== 'A4' && settings.invoiceDesign?.paperSize !== 'A5');
    const templateId = resolveTemplateId(settings);
    if (isThermal) {
        return withCommunityInvoiceAssets(generateThermalInvoice(invoice, customer, medicines, settings, isEnglish, dir, textAlign, t));
    }
    if (templateId === 'modern' || templateId === 'clean') {
        return withCommunityInvoiceAssets(generateTemplateA4Invoice(invoice, customer, medicines, settings, isEnglish, dir, textAlign, t, templateId));
    }
    return withCommunityInvoiceAssets(generateA4Invoice(invoice, customer, medicines, settings, isEnglish, dir, textAlign, t));
};
