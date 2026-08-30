import React, {useMemo, useState} from 'react';
import {Student} from '../types';
import {ArrowRight, GraduationCap} from 'lucide-react';
import {formatClassName, gradeLabel, parseGradeInput} from '../utils';
import Modal from './Modal';

interface Props {
    students: Student[];
    onClose: () => void;
    onApply: (fromGrade: number, toGrade: number) => void;
}

const PREVIEW_LIMIT = 80;

const BatchGradeModal: React.FC<Props> = ({students, onClose, onApply}) => {
    const [fromText, setFromText] = useState('');
    const [toText, setToText] = useState('');

    const fromGrade = parseGradeInput(fromText);
    const toGrade = parseGradeInput(toText);

    const existingGrades = useMemo(() => {
        const grades: number[] = [];
        students.forEach(s => {
            if (!grades.includes(s.grade)) grades.push(s.grade);
        });
        return grades.sort((a, b) => a - b);
    }, [students]);

    const matched = useMemo(() => {
        if (fromGrade === null || toGrade === null || fromGrade === toGrade) return [];
        return students.filter(s => s.grade === fromGrade);
    }, [students, fromGrade, toGrade]);

    const error = (() => {
        if (fromText.trim() && fromGrade === null) return '无法识别原年级，可填写 高二 或 2';
        if (toText.trim() && toGrade === null) return '无法识别新年级，可填写 高三 或 3';
        if (fromGrade !== null && toGrade !== null && fromGrade === toGrade) return '原年级与新年级相同';
        if (fromGrade !== null && toGrade !== null && matched.length === 0) {
            return `名单中没有${gradeLabel(fromGrade)}成员`;
        }
        return null;
    })();

    const canApply = fromGrade !== null && toGrade !== null && fromGrade !== toGrade && matched.length > 0;

    const renderGradePicker = (
        label: string,
        value: string,
        setValue: (v: string) => void,
        autoFocusInput: boolean
    ) => (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <input
                type="text"
                autoFocus={autoFocusInput}
                placeholder="输入年级，如 高二"
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary outline-none"
                value={value}
                onChange={e => setValue(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 mt-2">
                {existingGrades.map(g => (
                    <button
                        key={g}
                        onClick={() => setValue(gradeLabel(g))}
                        className={`px-2.5 py-1 text-xs border rounded-full transition ${
                            parseGradeInput(value) === g
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {gradeLabel(g)}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="批量更新年级"
            width="w-[26rem]"
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => canApply && onApply(fromGrade!, toGrade!)}
                        disabled={!canApply}
                        className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded text-sm transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        更新 {canApply ? `${matched.length} 人` : ''}
                    </button>
                </>
            }
        >
            <div className="space-y-5">
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
                    <GraduationCap size={14} className="shrink-0"/>
                    <span>把指定年级的成员整体改为另一个年级，例如 高二 → 高三。应用后可在提示条中撤销。</span>
                </div>

                {renderGradePicker('原年级', fromText, setFromText, true)}

                <div className="flex justify-center -my-2">
                    <ArrowRight size={16} className="text-gray-400 rotate-90"/>
                </div>

                {renderGradePicker('新年级', toText, setToText, false)}

                <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">
                        当前名单：
                        <span className="ml-1 font-normal text-gray-500">
                            {existingGrades.map(g =>
                                `${gradeLabel(g)} ${students.filter(s => s.grade === g).length} 人`
                            ).join(' · ') || '暂无成员'}
                        </span>
                    </div>
                    {matched.length > 0 && (
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50 space-y-1">
                            {matched.slice(0, PREVIEW_LIMIT).map(s => (
                                <div key={s.id} className="text-xs text-gray-600 flex items-center gap-2">
                                    <span className="font-medium text-gray-800">{s.name}</span>
                                    <span>{formatClassName(s.grade, s.classNum)}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-blue-600">
                                        {gradeLabel(toGrade!)}{s.classNum}班
                                    </span>
                                </div>
                            ))}
                            {matched.length > PREVIEW_LIMIT && (
                                <div className="text-xs text-gray-400">…等 {matched.length} 人</div>
                            )}
                        </div>
                    )}
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        </Modal>
    );
};

export default BatchGradeModal;
