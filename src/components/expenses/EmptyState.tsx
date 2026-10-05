import React from 'react';
import { EmptyStateShell } from '../ui/StateShell';
import { ReceiptIcon } from './icons';
interface EmptyStateProps {
    title: string;
    description?: string;
    action?: React.ReactNode;
}
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (<EmptyStateShell icon={<ReceiptIcon className="h-10 w-10 text-slate-300" strokeWidth={1.5}/>} title={title} description={description} action={action} className="py-10"/>);
