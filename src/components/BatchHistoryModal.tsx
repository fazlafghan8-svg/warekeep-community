import React from 'react';
import { AppSettings, Batch, Language } from '@/types';
import { Modal } from './ui/Modal';
import { formatAppDate } from '@/lib/formatters';
interface BatchHistoryModalProps {
    batch: Batch;
    onClose: () => void;
    language?: Language;
    settings?: AppSettings;
}
export const BatchHistoryModal: React.FC<BatchHistoryModalProps> = ({ batch, onClose, language = 'dari', settings }) => {
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const formatDate = (dateInput: string) => formatAppDate(dateInput, settings || ({ language } as AppSettings), 'medicineExpiry');
    const isCreateAction = (action: string) => {
        const normalized = action.trim().toLowerCase();
        return normalized === 'ایجاد' || normalized === 'created' || normalized === 'create';
    };
    const localizeAction = (action: string) => {
        if (!isEnglish)
            return action;
        const map: Record<string, string> = {
            'ایجاد': 'Created',
            'خرید': 'Purchase',
            'فروش': 'Sale',
            'برگشت فروش': 'Sales Return',
            'افزایش': 'Increase',
            'کاهش': 'Decrease',
            'افزایش (AI)': 'Restock (AI)',
            'خروج کالا': 'Stock Out'
        };
        return map[action] || action;
    };
    return (<Modal isOpen={true} onClose={onClose} title={`${tr('Batch History', 'تاریخچه سری ساخت')}: ${batch.batchNumber}`}>
      <div className="max-h-96 overflow-y-auto">
        <ul className="space-y-4">
          {batch.history.slice().reverse().map((log, index) => (<li key={index} className="flex items-start p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCreateAction(log.action) ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isCreateAction(log.action)
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"/>}
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-800">{localizeAction(log.action)}</p>
                <p className="text-sm text-gray-600">{log.details}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(log.date)}</p>
              </div>
            </li>))}
        </ul>
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">{tr('Close', 'بستن')}</button>
      </div>
    </Modal>);
};
