import React from 'react';
export const Logo: React.FC<{
    className?: string;
}> = ({ className = 'h-8 w-8' }) => {
    const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
    {
        return (<div className={`${className} inline-flex items-center justify-center rounded-2xl bg-slate-900 text-white`}>
        <span className="text-[42%] font-black tracking-[-0.06em]">W</span>
      </div>);
    }
};
