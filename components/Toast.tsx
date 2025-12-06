import React, {useEffect, useState} from 'react';
import {AlertCircle, CheckCircle, X} from 'lucide-react';

interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({message, type = 'success', onClose, duration = 3000}) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // 触发进入动画
        requestAnimationFrame(() => {
            setIsVisible(true);
        });

        const timer = setTimeout(() => {
            handleClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration]);

    const handleClose = () => {
        setIsVisible(false);
        // 等待动画结束后再调用 onClose
        setTimeout(onClose, 300);
    };

    const bgColor = type === 'success' ? 'bg-green-50' : type === 'error' ? 'bg-red-50' : 'bg-blue-50';
    const borderColor = type === 'success' ? 'border-green-200' : type === 'error' ? 'border-red-200' : 'border-blue-200';
    const textColor = type === 'success' ? 'text-green-800' : type === 'error' ? 'text-red-800' : 'text-blue-800';
    const Icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : CheckCircle;

    return (
        <div
            className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg transition-all duration-300 ${bgColor} ${borderColor} ${textColor} ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
        >
            <Icon size={20}/>
            <span className="font-medium">{message}</span>
            <button onClick={handleClose} className="ml-2 opacity-70 hover:opacity-100">
                <X size={16}/>
            </button>
        </div>
    );
};

export default Toast;
