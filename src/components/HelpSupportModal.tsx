import React from 'react';
import { Modal } from '@/components/ui/Modal';
interface HelpSupportModalProps {
    isOpen: boolean;
    onClose: () => void;
    isEnglish?: boolean;
}
export const HelpSupportModal: React.FC<HelpSupportModalProps> = ({ isOpen, onClose, isEnglish = false }) => {
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    {
        return (<Modal isOpen={isOpen} onClose={onClose} title={tr('Offline help', 'راهنمای آفلاین')} maxWidthClassName="max-w-2xl">
        <div className="space-y-4 p-4 text-sm leading-7 text-slate-700" dir={isEnglish ? 'ltr' : 'rtl'}>
          <p>{tr('Your work stays on this device. You do not need an account, subscription, or internet connection.', 'کارهای شما در همین دستگاه نگهداری می‌شود. برای استفاده به حساب، اشتراک یا اینترنت نیاز ندارید.')}</p>
          <p>{tr('To protect your data, open Settings → Maintenance and download a backup regularly. Keep a copy on another drive.', 'برای نگهداری از اطلاعات، به «تنظیمات ← نگهداری» بروید و مرتب نسخهٔ پشتیبان بگیرید. یک کاپی را در حافظهٔ جداگانه نگه دارید.')}</p>
          <p>{tr('To recover your work, use Restore in the same section and select your backup file.', 'برای بازگرداندن اطلاعات، در همان بخش «بازیابی» را بزنید و پروندهٔ پشتیبان خود را انتخاب کنید.')}</p>
        </div>
      </Modal>);
    }
};
