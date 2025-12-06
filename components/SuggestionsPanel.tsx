import React from 'react';
import {ConflictInfo, SuggestionInfo} from '../services/scheduler';
import {ALL_TASKS} from '../constants';
import {Student} from '../types';
import {AlertTriangle, CheckCircle2, Lightbulb, XCircle} from 'lucide-react';

interface Props {
    suggestions: SuggestionInfo[];
    students: Student[];
    onApplySuggestion?: (conflict: ConflictInfo, suggestedStudentId: string) => void;
}

export const SuggestionsPanel: React.FC<Props> = ({suggestions, students, onApplySuggestion}) => {
    const getTaskName = (taskId: string) => {
        if (taskId === 'time-conflict') return '时间冲突';
        if (taskId === 'multiple-tasks') return '负载过重';
        const task = ALL_TASKS.find(t => t.id === taskId);
        return task ? `${task.category} - ${task.name}` : taskId;
    };

    const getStudentName = (sid: string) => {
        const s = students.find(st => st.id === sid);
        return s ? s.name : sid;
    };

    if (suggestions.length === 0) {
        return (
            <div
                className="bg-gradient-to-b from-white to-gray-50 border-l border-gray-200 w-80 shrink-0 flex flex-col shadow-lg">
                <div className="p-6 border-b border-gray-200 bg-white">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CheckCircle2 className="text-green-500"/> 智能检查
                    </h2>
                    <p className="text-gray-500 text-xs mt-1">实时监控排班冲突与建议</p>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div
                        className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
                        <CheckCircle2 className="text-green-600 w-8 h-8"/>
                    </div>
                    <h3 className="text-green-800 font-semibold mb-2">一切正常</h3>
                    <p className="text-gray-400 text-sm">当前编排符合所有规则，未发现冲突。</p>
                </div>
            </div>
        );
    }

    const errors = suggestions.filter(s => s.conflict.type === 'error');
    const warnings = suggestions.filter(s => s.conflict.type === 'warning');

    return (
        <div
            className="bg-gradient-to-b from-white to-gray-50 border-l border-gray-200 w-80 shrink-0 flex flex-col shadow-lg h-full overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-white shadow-sm z-10">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <AlertTriangle className="text-amber-500"/>
                    发现 {suggestions.length} 个问题
                </h2>
                <div className="flex gap-2 mt-2">
                    {errors.length > 0 && <span
                        className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{errors.length} 错误</span>}
                    {warnings.length > 0 && <span
                        className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{warnings.length} 警告</span>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-200">
                {/* Errors Section */}
                {errors.length > 0 && (
                    <div className="space-y-3">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">必须修复</div>
                        {errors.map((s, idx) => (
                            <div key={`err-${idx}`}
                                 className="bg-white border-l-4 border-red-500 rounded-r-lg shadow-sm p-3 hover:shadow-md transition-shadow group">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="font-semibold text-gray-800 text-sm flex items-center gap-1">
                                        <XCircle className="w-3 h-3 text-red-500"/>
                                        {getTaskName(s.conflict.taskId)}
                                    </div>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                第{s.conflict.groupId + 1}组
                            </span>
                                </div>
                                <div className="text-sm text-gray-600 mb-2 pl-4">
                                    <span
                                        className="font-medium text-gray-900">{getStudentName(s.conflict.studentId)}</span>
                                    <span className="text-red-500 ml-1">{s.conflict.reason}</span>
                                </div>
                                {s.suggestedReason && (
                                    <div
                                        className="ml-4 bg-blue-50 p-2 rounded-md border border-blue-100 flex flex-col gap-2">
                                        <div className="flex gap-2 items-start">
                                            <Lightbulb className="w-3 h-3 text-blue-600 mt-0.5 shrink-0"/>
                                            <div className="text-xs text-blue-700 leading-tight">
                                                {s.suggestedReason}
                                            </div>
                                        </div>
                                        {s.suggestedStudentId && onApplySuggestion && (
                                            <button
                                                onClick={() => onApplySuggestion(s.conflict, s.suggestedStudentId!)}
                                                className="self-end px-2 py-1 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-700 transition shadow-sm"
                                            >
                                                应用
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Warnings Section */}
                {warnings.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">建议关注</div>
                        {warnings.map((s, idx) => (
                            <div key={`warn-${idx}`}
                                 className="bg-white border-l-4 border-amber-400 rounded-r-lg shadow-sm p-3 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="font-semibold text-gray-800 text-sm flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 text-amber-500"/>
                                        {getTaskName(s.conflict.taskId)}
                                    </div>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                第{s.conflict.groupId + 1}组
                            </span>
                                </div>
                                <div className="text-sm text-gray-600 pl-4">
                                    <span
                                        className="font-medium text-gray-900">{getStudentName(s.conflict.studentId)}</span>
                                    <span className="text-amber-600 ml-1">{s.conflict.reason}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
