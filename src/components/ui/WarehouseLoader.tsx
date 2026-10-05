import React, { useEffect, useState } from 'react';
interface WarehouseLoaderProps {
    progress: number;
    statusText: string;
    onComplete?: () => void;
}
export const WarehouseLoader: React.FC<WarehouseLoaderProps> = ({ progress, statusText, onComplete }) => {
    const [videoError, setVideoError] = useState(false);
    const [isVideoLoaded, setIsVideoLoaded] = useState(true);
    const [boxes, setBoxes] = useState<number[]>([]);
    const introVideoSrc = `${import.meta.env.BASE_URL}intro.mp4`;
    useEffect(() => {
        if (progress >= 100) {
            const timer = setTimeout(() => {
                setIsVideoLoaded(false);
                if (onComplete)
                    onComplete();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [progress, onComplete]);
    useEffect(() => {
        if (videoError) {
            const totalBoxes = 20;
            const boxesToShow = Math.floor((progress / 100) * totalBoxes);
            setBoxes(Array.from({ length: boxesToShow }, (_, i) => i));
        }
    }, [progress, videoError]);
    {
        return (<div className="fixed inset-0 z-[9999] bg-[#1a1a1a] flex flex-col items-center justify-center font-sans overflow-hidden" dir="ltr">
            <div className="relative w-[300px] h-[300px] mb-8 perspective-1000">
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[260px] h-[200px] border-4 border-gray-600 rounded-sm bg-gray-800/50 flex flex-col justify-between p-2 shadow-2xl">
                    <div className="border-b-4 border-gray-600 h-1/3 w-full relative flex items-end gap-1 px-1">
                        {boxes.filter(b => b < 6).map(b => <div key={b} className="w-[36px] h-[36px] bg-amber-600 border border-amber-700 rounded-sm shadow-sm animate-box-drop"></div>)}
                    </div>
                    <div className="border-b-4 border-gray-600 h-1/3 w-full relative flex items-end gap-1 px-1">
                        {boxes.filter(b => b >= 6 && b < 13).map(b => <div key={b} className="w-[36px] h-[36px] bg-amber-600 border border-amber-700 rounded-sm shadow-sm animate-box-drop"></div>)}
                    </div>
                    <div className="h-1/3 w-full relative flex items-end gap-1 px-1">
                        {boxes.filter(b => b >= 13).map(b => <div key={b} className="w-[36px] h-[36px] bg-amber-600 border border-amber-700 rounded-sm shadow-sm animate-box-drop"></div>)}
                    </div>
                </div>
            </div>
            <h2 className="mb-2 text-2xl font-black tracking-[0.14em] text-white animate-pulse">WareKeep</h2>
            <p className="text-blue-300 text-sm font-medium mb-1 font-mono">{statusText}</p>
            <div className="w-64 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-4">
                <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}/>
            </div>
        </div>);
    }
};
