import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, AppUser, Language } from '../../types';
import { normalizePersianNumbers } from '../../utils/localization';
import { Logo } from './Logo';
import { getTranslation } from '../../utils/translations';
import { formatAppDate, formatAppTime } from '@/lib/formatters';
interface LockScreenProps {
    users: AppUser[];
    onUnlock: (user: AppUser) => void;
    currentUser?: AppUser | null;
    onLogout?: () => void;
    language?: Language;
    settings?: AppSettings;
}
export const LockScreen: React.FC<LockScreenProps> = ({ users, onUnlock, currentUser, onLogout, language = 'dari', settings }) => {
    const t = getTranslation(language as Language);
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const dateSettings = settings || ({ language } as AppSettings);
    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        if (currentUser) {
            setSelectedUser(currentUser);
        }
        else if (users.length === 1) {
            setSelectedUser(users[0]);
        }
    }, [currentUser, users]);
    useEffect(() => {
        if (selectedUser) {
            const timeout = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(timeout);
        }
    }, [selectedUser, error]);
    const ensureFocus = () => {
        if (selectedUser)
            inputRef.current?.focus();
    };
    const handleUserSelect = (user: AppUser) => {
        setSelectedUser(user);
        setPin('');
        setError(false);
    };
    const validatePin = (inputPin: string) => {
        if (selectedUser && inputPin.length === selectedUser.pinCode.length) {
            if (inputPin === selectedUser.pinCode) {
                onUnlock(selectedUser);
            }
            else {
                setError(true);
                setTimeout(() => {
                    setPin('');
                    setError(false);
                }, 400);
            }
        }
    };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = normalizePersianNumbers(e.target.value).replace(/\D/g, '');
        if (val.length <= 6) {
            setPin(val);
            setError(false);
            validatePin(val);
        }
    };
    const handleKeypadClick = (digit: string) => {
        if (pin.length < 6) {
            const newPin = pin + digit;
            setPin(newPin);
            validatePin(newPin);
        }
        inputRef.current?.focus();
    };
    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
        inputRef.current?.focus();
    };
    const handleSwitchUser = () => {
        setSelectedUser(null);
        setPin('');
    };
    const handleEmergencyUnlock = () => {
        const tempUser: AppUser = {
            id: 'temp-admin',
            name: tr('Emergency Admin', 'مدیر اضطراری'),
            role: 'admin',
            pinCode: '',
            permissions: [],
            baseSalary: 0,
            commissionRate: 0
        };
        onUnlock(tempUser);
    };
    return (<div className="fixed inset-0 z-[100] flex font-sans overflow-hidden bg-gray-900" dir={isEnglish ? "ltr" : "rtl"}>
        
        {/* LEFT SIDE: Branding & Time */}
        <div className="hidden lg:flex w-5/12 bg-gradient-to-br from-blue-900 to-slate-900 relative flex-col justify-between p-12 text-white overflow-hidden border-l border-white/10 shadow-2xl z-10">
            <div className="absolute top-0 right-0 w-full h-full opacity-20 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-blue-500 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-500 rounded-full blur-[100px]"></div>
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                    <div className="overflow-hidden rounded-full bg-white/92 p-1 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.55)] ring-1 ring-white/20 backdrop-blur-sm">
                        <Logo className="h-10 w-10"/>
                    </div>
                    <span className="text-2xl font-black tracking-[0.08em] opacity-90">WareKeep</span>
                </div>
                <p className="text-blue-200 text-sm max-w-xs leading-relaxed">
                    {tr('Comprehensive Pharmacy Management System.', 'سیستم جامع مدیریت انبار و دواخانه.')}
                </p>
            </div>

            <div className="relative z-10">
                <div className="text-7xl font-black mb-2 tracking-tighter" dir="ltr">
                    {formatAppTime(currentTime, dateSettings, 'system')}
                </div>
                <div className="text-xl text-blue-200 font-medium">
                    {formatAppDate(currentTime, dateSettings, 'system')}
                </div>
                <div className="mt-8 flex gap-4">
                    <div className="bg-white/10 rounded-lg p-3 backdrop-blur-md border border-white/5">
                        <p className="text-xs text-blue-300 uppercase mb-1">{t.systemOnline}</p>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                            <span className="text-sm font-bold">{tr('Online', 'آنلاین')}</span>
                        </div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3 backdrop-blur-md border border-white/5">
                        <p className="text-xs text-blue-300 uppercase mb-1">{t.activeUsers}</p>
                        <p className="text-sm font-bold">{users.length}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="w-full lg:w-7/12 bg-gray-50 flex items-center justify-center p-8 relative" onClick={ensureFocus}>
            <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
            
            <div className="w-full max-w-md relative z-10">
                
                {!selectedUser ? (<div className="animate-fade-in">
                        <h2 className="text-3xl font-black text-gray-800 mb-2 text-center">{t.selectUser}</h2>
                        <p className="text-gray-500 text-center mb-8">{t.whoAreYou}</p>

                        {users.length === 0 ? (<div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-red-300 p-6 shadow-md">
                                <p className="text-gray-800 font-bold mb-2">{tr('No users defined.', 'هیچ کاربری تعریف نشده است.')}</p>
                                <button onClick={handleEmergencyUnlock} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition shadow-lg pointer-events-auto">
                                    {tr('Emergency Unlock', 'بازکردن اضطراری')}
                                </button>
                            </div>) : (<div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-2 no-scrollbar">
                                {users.map(user => (<button key={user.id} onClick={() => handleUserSelect(user)} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg border-2 border-transparent hover:border-blue-500 transition-all duration-200 group flex flex-col items-center gap-3 no-drag">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-md transition-transform group-hover:scale-110 ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {user.name.charAt(0)}
                                        </div>
                                        <div className="text-center">
                                            <p className="font-bold text-gray-800 text-lg group-hover:text-blue-700">{user.name}</p>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {user.role === 'admin' ? (isEnglish ? 'Admin' : 'مدیر') : (isEnglish ? 'Staff' : 'کارمند')}
                                            </span>
                                        </div>
                                    </button>))}
                            </div>)}

                        {onLogout && (<div className="mt-8 text-center">
                                <button onClick={onLogout} className="text-red-500 hover:text-red-700 text-sm font-medium hover:underline transition no-drag">
                                    {t.logout}
                                </button>
                            </div>)}
                    </div>) : (<div className="animate-fade-in flex flex-col items-center w-full max-w-xs mx-auto">
                        {users.length > 1 && (<button onClick={handleSwitchUser} className="absolute top-0 right-0 text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm transition no-drag">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                                {t.switchUser}
                            </button>)}

                        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold mb-4 shadow-xl ${selectedUser.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {selectedUser.name.charAt(0)}
                        </div>
                        <h3 className="text-2xl font-black text-gray-800 mb-1">{selectedUser.name}</h3>
                        <p className={`text-sm font-medium mb-8 ${error ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                            {error ? t.wrongPin : t.enterPin}
                        </p>

                        <div className={`flex gap-4 mb-8 ${error ? 'animate-shake' : ''}`}>
                            {[...Array(4)].map((_, i) => (<div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 border-2 ${i < pin.length ? (error ? 'bg-red-500 border-red-500' : 'bg-blue-600 border-blue-600 scale-110') : 'bg-transparent border-gray-300'}`}></div>))}
                        </div>

                        <input ref={inputRef} type="text" inputMode="numeric" autoComplete="off" value={pin} onChange={handleInputChange} className="opacity-0 absolute w-1 h-1 -z-10" autoFocus/>

                        <div className="grid grid-cols-3 gap-4 w-full" dir="ltr">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={(e) => { e.stopPropagation(); handleKeypadClick(num.toString()); }} className="h-16 rounded-2xl bg-white shadow-sm hover:shadow-md border border-gray-200 text-2xl font-bold text-gray-700 active:bg-gray-50 active:scale-95 transition-all no-drag">{num}</button>))}
                            <div className="h-16"></div>
                            <button onClick={(e) => { e.stopPropagation(); handleKeypadClick('0'); }} className="h-16 rounded-2xl bg-white shadow-sm hover:shadow-md border border-gray-200 text-2xl font-bold text-gray-700 active:bg-gray-50 active:scale-95 transition-all no-drag">0</button>
                            <button onClick={(e) => { e.stopPropagation(); handleBackspace(); }} className="h-16 rounded-2xl flex items-center justify-center text-gray-400 hover:text-red-500 active:scale-95 transition-all no-drag">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"/></svg>
                            </button>
                        </div>
                    </div>)}
            </div>
        </div>
        <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(5px); } 75% { transform: translateX(-5px); } } .animate-shake { animation: shake 0.3s ease-in-out; }`}</style>
    </div>);
};
