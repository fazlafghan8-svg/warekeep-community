import React, { useRef, useState, useEffect } from 'react';
import { Invoice, Customer, Medicine, AppSettings } from '../types';
import { Modal } from './ui/Modal';
import { generateInvoiceHTML } from '../utils/invoiceGenerator';
import { openPrintWindow } from '@/utils/printWindow';
interface InvoicePrintModalProps {
    invoice: Invoice;
    customer: Customer;
    medicines: Medicine[];
    onClose: () => void;
    settings: AppSettings;
    autoPrint?: boolean;
}
export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ invoice, customer, medicines, onClose, settings, autoPrint }) => {
    const [htmlContent, setHtmlContent] = useState('');
    const printedRef = useRef(false);
    const previewFrameRef = useRef<HTMLIFrameElement>(null);
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const fullHtml = React.useMemo(() => generateInvoiceHTML(invoice, customer, medicines, settings), [invoice, customer, medicines, settings]);
    useEffect(() => {
        setHtmlContent(fullHtml);
    }, [fullHtml]);
    const sanitizeFilename = (name: string) => {
        return name.replace(/[\/\\?%*:|"<>]/g, '-').trim();
    };
    const getSmartFilename = () => {
        const invoiceNumber = invoice.invoiceNumber ? String(invoice.invoiceNumber) : invoice.id.replace(/\D/g, '').slice(-6);
        const datePart = new Date(invoice.date).toISOString().split('T')[0];
        const customerName = sanitizeFilename(customer.name || 'Unknown');
        const format = settings.filenameFormat || 'Invoice-{ID}';
        let filename = format
            .replace('{ID}', invoiceNumber)
            .replace('{Customer}', customerName)
            .replace('{Date}', datePart);
        if (!filename.toLowerCase().endsWith('.html')) {
            filename += '.html';
        }
        return filename;
    };
    const handlePrint = async () => {
        const filename = getSmartFilename();
        try {
            if (window.electronAPI?.saveInvoiceHtml) {
                await window.electronAPI.saveInvoiceHtml(fullHtml, filename, settings.defaultInvoiceSavePath);
            }
            else {
                const blob = new Blob([fullHtml], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                if (document.body.contains(a))
                    document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }
        catch (e) {
            console.error('Save failed:', e);
        }
        const previewWindow = previewFrameRef.current?.contentWindow;
        if (previewWindow) {
            previewWindow.focus();
            previewWindow.print();
            return;
        }
        const printWindow = openPrintWindow('height=1123,width=794');
        if (printWindow) {
            printWindow.document.write(fullHtml);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                if (!printWindow.closed) {
                    printWindow.print();
                }
            }, 500);
        }
    };
    useEffect(() => {
        if (autoPrint && !printedRef.current) {
            printedRef.current = true;
            const timer = setTimeout(() => {
                handlePrint();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [autoPrint, fullHtml]);
    return (<Modal isOpen={true} onClose={onClose} title={tr('Invoice Preview & Print', 'پیش‌نمایش و چاپ فاکتور')} overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-[var(--wk-glass-dark-fill)] p-4 backdrop-blur-sm transition-opacity">
      <div className="flex flex-col h-full max-h-[90vh]" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="p-4 bg-gray-50 border-b flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{tr('Print Preview (A4)', 'پیش‌نمایش چاپ (A4)')}</h3>
            <p className="text-xs text-gray-500 mt-1">{tr('Designed with logo colors and standard page dimensions', 'طراحی متناسب با رنگ لوگو و ابعاد استاندارد')}</p>
          </div>
          <div className="flex gap-3 items-center">
            <button onClick={handlePrint} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center shadow-lg shadow-blue-500/30 transition font-semibold">
              <svg className={`${isEnglish ? 'mr-2' : 'ml-2'} w-5 h-5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z"/>
              </svg>
              {tr('Save & Print', 'ذخیره و چاپ')}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white bg-white transition shadow-sm">
              {tr('Close', 'بستن')}
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-gray-200 flex justify-center">
          <div className="bg-white shadow-2xl p-[10mm] w-[210mm] min-h-[297mm] h-fit">
            <iframe ref={previewFrameRef} key={htmlContent.length} srcDoc={htmlContent} className="w-full h-[277mm] border-none" title={tr('Invoice Preview', 'پیش‌نمایش فاکتور')}/>
          </div>
        </div>
      </div>
    </Modal>);
};
