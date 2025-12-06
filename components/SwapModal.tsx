import React, { useState, useEffect, useMemo } from 'react';
import { Student, ScheduleState, TaskDefinition, TaskCategory } from '../types';
import { ALL_TASKS } from '../constants';
import { findSwapOptions, SwapProposal } from '../services/swapService';
import Modal from './Modal';
import { autoScheduleMultiGroupAsync } from '../services/scheduler';
import { formatClassName } from '../utils';

interface SwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    scheduleState: ScheduleState;
    numGroups: number;
    onApplySwap: (proposal: SwapProposal, studentId: string, originalTaskId: string, originalGroupId: number) => void;
    onGlobalReschedule: (newAssignments: Record<string, string>) => void;
}

const ScheduleDiffTable: React.FC<{
    students: Student[];
    oldAssignments: Record<string, string>;
    newAssignments: Record<string, string>;
    groupCount: number;
}> = ({ students, oldAssignments, newAssignments, groupCount }) => {
    const groups = useMemo(() => Array.from({ length: groupCount }, (_, i) => i), [groupCount]);

    const getGroupName = (idx: number) => {
        const map = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        return `第${map[idx] || (idx + 1)}组`;
    };

    const tasksByCategory = useMemo(() => ({
        [TaskCategory.CLEANING]: ALL_TASKS.filter(t => t.category === TaskCategory.CLEANING),
        [TaskCategory.INTERVAL_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.INTERVAL_EXERCISE),
        [TaskCategory.EYE_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.EYE_EXERCISE),
        [TaskCategory.EVENING_STUDY]: ALL_TASKS.filter(t => t.category === TaskCategory.EVENING_STUDY),
    }), []);

    const getStudentName = (sid: string | undefined) => {
        if (!sid) return null;
        const s = students.find(stu => stu.id === sid);
        return s ? `${s.name} (${formatClassName(s.grade, s.classNum)})` : '未知';
    };

    return (
        <div className="overflow-x-auto border rounded shadow-sm bg-white">
            <table className="w-full border-collapse border border-gray-300 text-xs table-fixed min-w-[800px]">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-2 w-20 font-bold text-gray-700">项目</th>
                        <th className="border border-gray-300 p-2 w-16 font-bold text-gray-700">细项</th>
                        <th className="border border-gray-300 p-2 w-24 font-bold text-gray-700">内容</th>
                        {groups.map(g => (
                            <th key={g} className="border border-gray-300 p-2 font-bold text-gray-700">
                                {getGroupName(g)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(tasksByCategory).map(([category, tasks]) => {
                        const subCatCounts: Record<string, number> = {};
                        tasks.forEach(t => {
                            subCatCounts[t.subCategory] = (subCatCounts[t.subCategory] || 0) + 1;
                        });
                        const renderedSubCats: Record<string, boolean> = {};

                        return tasks.map((task, index) => {
                            const isFirstOfCategory = index === 0;
                            const isFirstOfSubCat = !renderedSubCats[task.subCategory];
                            if (isFirstOfSubCat) renderedSubCats[task.subCategory] = true;

                            return (
                                <tr key={task.id} className="hover:bg-gray-50">
                                    {isFirstOfCategory && (
                                        <td className="border border-gray-300 p-2 font-bold text-gray-700 bg-white align-middle text-center" rowSpan={tasks.length}>
                                            {category}
                                        </td>
                                    )}
                                    {isFirstOfSubCat && (
                                        <td className="border border-gray-300 p-2 text-gray-700 text-center align-middle" rowSpan={subCatCounts[task.subCategory]}>
                                            {task.subCategory}
                                        </td>
                                    )}
                                    <td className="border border-gray-300 p-2 text-gray-800 text-center truncate" title={task.name}>
                                        {task.name}
                                    </td>
                                    {groups.map(g => {
                                        const key = `${task.id}::${g}`;
                                        const oldSid = oldAssignments[key];
                                        const newSid = newAssignments[key];
                                        const isChanged = oldSid !== newSid;

                                        let bgClass = 'bg-white';
                                        if (isChanged) {
                                            bgClass = 'bg-yellow-50'; // Highlight changed cells
                                        }

                                        return (
                                            <td key={g} className={`border border-gray-300 p-1 text-center align-middle ${bgClass}`}>
                                                {isChanged ? (
                                                    <div className="flex flex-col gap-1">
                                                        {oldSid && (
                                                            <div className="text-red-400 line-through text-[10px]">
                                                                {getStudentName(oldSid)}
                                                            </div>
                                                        )}
                                                        {newSid && (
                                                            <div className="text-green-600 font-bold">
                                                                {getStudentName(newSid)}
                                                            </div>
                                                        )}
                                                        {!newSid && <span className="text-gray-300">-</span>}
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-500">
                                                        {getStudentName(newSid) || '-'}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        });
                    })}
                </tbody>
            </table>
        </div>
    );
};

const SwapModal: React.FC<SwapModalProps> = ({
    isOpen,
    onClose,
    students,
    scheduleState,
    numGroups,
    onApplySwap,
    onGlobalReschedule
}) => {
    const [mode, setMode] = useState<'swap' | 'wish'>('swap');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [selectedTaskKey, setSelectedTaskKey] = useState<string>('');
    const [options, setOptions] = useState<SwapProposal[]>([]);

    // Wish mode state
    const [wishCategory, setWishCategory] = useState<string>('');
    const [wishTaskId, setWishTaskId] = useState<string>('');
    const [wishGroupId, setWishGroupId] = useState<number>(0);
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculationStatus, setCalculationStatus] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string>('');

    // New: Preview state
    const [viewMode, setViewMode] = useState<'input' | 'preview'>('input');
    const [previewType, setPreviewType] = useState<'list' | 'table'>('list'); // Toggle list/table
    const [generatedProposals, setGeneratedProposals] = useState<Record<string, string>[]>([]);
    const [currentProposalIndex, setCurrentProposalIndex] = useState<number>(0);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedStudentId('');
            setSelectedTaskKey('');
            setOptions([]);
            setMode('swap');
            setWishCategory('');
            setWishTaskId('');
            setIsCalculating(false);
            setCalculationStatus('');
            setErrorMessage('');
            setViewMode('input');
            setPreviewType('list');
            setGeneratedProposals([]);
            setCurrentProposalIndex(0);
        }
    }, [isOpen]);

    // Get assignments for the selected student
    const studentAssignments = useMemo(() => {
        if (!selectedStudentId) return [];
        const tasks: { task: TaskDefinition; groupId: number; key: string }[] = [];
        
        Object.entries(scheduleState.assignments).forEach(([key, sid]) => {
            if (sid === selectedStudentId) {
                const [taskId, gStr] = key.split('::');
                const task = ALL_TASKS.find(t => t.id === taskId);
                if (task) {
                    tasks.push({
                        task,
                        groupId: parseInt(gStr),
                        key
                    });
                }
            }
        });
        return tasks;
    }, [selectedStudentId, scheduleState.assignments]);

    // Calculate options when student and task are selected (Swap Mode)
    useEffect(() => {
        if (mode === 'swap' && selectedStudentId && selectedTaskKey) {
            const student = students.find(s => s.id === selectedStudentId);
            const [taskId, gStr] = selectedTaskKey.split('::');
            const groupId = parseInt(gStr);

            if (student) {
                const proposals = findSwapOptions(
                    student,
                    taskId,
                    groupId,
                    scheduleState,
                    numGroups
                );
                setOptions(proposals);
            }
        } else {
            setOptions([]);
        }
    }, [mode, selectedStudentId, selectedTaskKey, students, scheduleState, numGroups]);

    const handleApply = (proposal: SwapProposal) => {
        const [taskId, gStr] = selectedTaskKey.split('::');
        onApplySwap(proposal, selectedStudentId, taskId, parseInt(gStr));
        onClose();
    };

    const handleWishReschedule = async () => {
        if (!selectedStudentId || !wishTaskId) return;
        
        setIsCalculating(true);
        setErrorMessage('');
        setCalculationStatus('正在初始化...');
        setGeneratedProposals([]);

        try {
            // Clone current state to minimize changes
            const currentAssignments = { ...scheduleState.assignments };
            const targetKey = `${wishTaskId}::${wishGroupId}`;

            // 1. Remove the student's existing assignments (so they are free to move)
            // This unlocks them from their old group/task
            Object.keys(currentAssignments).forEach(key => {
                if (currentAssignments[key] === selectedStudentId) {
                    delete currentAssignments[key];
                }
            });

            // 2. Remove the assignment at the target slot (if any)
            // This unlocks the incumbent (they will be redistributed)
            if (currentAssignments[targetKey]) {
                delete currentAssignments[targetKey];
            }

            // 3. Force the wish
            currentAssignments[targetKey] = selectedStudentId;

            // Run 3 attempts to find diverse solutions
            const attempts = 3;
            const results: Record<string, string>[] = [];

            for (let i = 0; i < attempts; i++) {
                setCalculationStatus(`正在计算方案 ${i + 1}/${attempts}...`);
                const newAssignments = await autoScheduleMultiGroupAsync(
                    students,
                    currentAssignments,
                    numGroups,
                    (log) => {
                         // Only update if it's a status update, avoid too many re-renders
                         if (log.includes('初始化')) return;
                    }
                );

                if (newAssignments[targetKey] === selectedStudentId) {
                    // Strict Check: Ensure NO empty slots
                    const totalSlots = ALL_TASKS.length * numGroups;
                    const assignedCount = Object.keys(newAssignments).length;

                    if (assignedCount < totalSlots) {
                        console.warn(`Attempt ${i+1} failed: Incomplete assignment (${assignedCount}/${totalSlots})`);
                        continue;
                    }

                    // Deduplicate
                    const isDuplicate = results.some(r => JSON.stringify(r) === JSON.stringify(newAssignments));
                    if (!isDuplicate) {
                        results.push(newAssignments);
                    }
                }
            }

            if (results.length > 0) {
                setGeneratedProposals(results);
                setCurrentProposalIndex(0);
                setViewMode('preview');
                setPreviewType('list'); // Default to list view
                setIsCalculating(false);
            } else {
                setErrorMessage('计算失败：无法生成无空缺的有效方案（可能是硬性约束冲突导致）');
                setIsCalculating(false);
            }

        } catch (e) {
            console.error(e);
            setErrorMessage('计算过程中发生错误');
            setIsCalculating(false);
        }
    };

    // Helper to calculate diff
    const getDiff = (oldAssign: Record<string, string>, newAssign: Record<string, string>) => {
        const changes: { student: Student; oldTasks: string[]; newTasks: string[] }[] = [];
        
        students.forEach(student => {
            // Helper to get task names for a student
            const getTasks = (assign: Record<string, string>) => {
                return Object.entries(assign)
                    .filter(([_, sid]) => sid === student.id)
                    .map(([key]) => {
                        const [taskId, gStr] = key.split('::');
                        const task = ALL_TASKS.find(t => t.id === taskId);
                        return task ? `[${parseInt(gStr) + 1}组] ${task.name}` : '未知任务';
                    })
                    .sort();
            };

            const oldTasks = getTasks(oldAssign);
            const newTasks = getTasks(newAssign);

            if (JSON.stringify(oldTasks) !== JSON.stringify(newTasks)) {
                changes.push({ student, oldTasks, newTasks });
            }
        });

        return changes;
    };

    // Searchable student select (simplified for now, just a native select)
    // Group students by Department for easier finding
    const studentsByDept = useMemo(() => {
        const groups: Record<string, Student[]> = {};
        students.forEach(s => {
            if (!groups[s.department]) groups[s.department] = [];
            groups[s.department].push(s);
        });
        return groups;
    }, [students]);

    // Group tasks by category
    const tasksByCategory = useMemo(() => {
        const groups: Record<string, TaskDefinition[]> = {};
        ALL_TASKS.forEach(t => {
            if (!groups[t.category]) groups[t.category] = [];
            groups[t.category].push(t);
        });
        return groups;
    }, []);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="智能调换建议" width="w-[1000px]">
            {viewMode === 'input' ? (
                <>
                    <div className="flex gap-2 mb-4 border-b pb-2">
                        <button
                            onClick={() => setMode('swap')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                mode === 'swap' 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            快速调换
                        </button>
                        <button
                            onClick={() => setMode('wish')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                mode === 'wish' 
                                    ? 'bg-purple-100 text-purple-700' 
                                    : 'text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            许愿重排
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">选择学生</label>
                            <select
                                className="w-full border border-gray-300 rounded p-2"
                                value={selectedStudentId}
                                onChange={(e) => {
                                    setSelectedStudentId(e.target.value);
                                    setSelectedTaskKey('');
                                }}
                            >
                                <option value="">请选择...</option>
                                {Object.entries(studentsByDept).map(([dept, list]) => (
                                    <optgroup key={dept} label={dept}>
                                        {list.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {formatClassName(s.grade, s.classNum)} - {s.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        {mode === 'swap' && (
                            <>
                                {selectedStudentId && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">选择希望更换的当前任务</label>
                                        {studentAssignments.length === 0 ? (
                                            <div className="text-gray-500 text-sm">该学生当前没有分配任何任务</div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-2">
                                                {studentAssignments.map(({ task, groupId, key }) => (
                                                    <button
                                                        key={key}
                                                        className={`p-3 text-left border rounded transition-colors ${
                                                            selectedTaskKey === key
                                                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                                                                : 'border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                        onClick={() => setSelectedTaskKey(key)}
                                                    >
                                                        <div className="font-medium text-gray-900">
                                                            第{groupId + 1}组 - {task.name}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {task.category} | {task.timeSlot}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectedTaskKey && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            可用的调换方案 ({options.length})
                                        </label>
                                        <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-2 bg-gray-50">
                                            {options.length === 0 ? (
                                                <div className="text-gray-500 text-center py-4">
                                                    未找到无冲突的调换方案
                                                </div>
                                            ) : (
                                                options.map((opt, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="bg-white p-3 border border-gray-200 rounded shadow-sm hover:shadow-md transition-shadow flex justify-between items-center"
                                                    >
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {opt.description}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {opt.type === 'MOVE_TO_EMPTY' ? '直接移动到空位' : '与现有人员互换'}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleApply(opt)}
                                                            className="ml-3 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                                        >
                                                            应用
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {mode === 'wish' && selectedStudentId && (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-sm text-purple-800">
                                    <strong>说明：</strong> 此功能会强制将所选任务分配给该学生，并尝试重新编排其他所有人的任务以解决冲突。这可能会导致大规模的人员变动。
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">目标组别</label>
                                        <select
                                            className="w-full border border-gray-300 rounded p-2"
                                            value={wishGroupId}
                                            onChange={(e) => setWishGroupId(parseInt(e.target.value))}
                                        >
                                            {Array.from({ length: numGroups }).map((_, idx) => (
                                                <option key={idx} value={idx}>第 {idx + 1} 组</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
                                        <select
                                            className="w-full border border-gray-300 rounded p-2"
                                            value={wishCategory}
                                            onChange={(e) => {
                                                setWishCategory(e.target.value);
                                                setWishTaskId('');
                                            }}
                                        >
                                            <option value="">请选择类型...</option>
                                            {Object.keys(tasksByCategory).map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {wishCategory && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">具体任务</label>
                                        <select
                                            className="w-full border border-gray-300 rounded p-2"
                                            value={wishTaskId}
                                            onChange={(e) => setWishTaskId(e.target.value)}
                                        >
                                            <option value="">请选择任务...</option>
                                            {tasksByCategory[wishCategory].map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.subCategory} - {t.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="pt-2 space-y-2">
                                    {errorMessage && (
                                        <div className="p-3 bg-red-50 border border-red-100 rounded text-sm text-red-600">
                                            {errorMessage}
                                        </div>
                                    )}
                                    
                                    {isCalculating ? (
                                        <div className="text-center py-3 bg-gray-50 rounded border">
                                            <div className="text-blue-600 font-medium mb-1">正在计算重排方案...</div>
                                            <div className="text-xs text-gray-500 truncate px-4" title={calculationStatus}>
                                                {calculationStatus}
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleWishReschedule}
                                            disabled={!wishTaskId}
                                            className="w-full py-3 bg-purple-600 text-white rounded font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                        >
                                            尝试生成多种方案
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex flex-col h-[600px]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-lg font-medium">
                                已生成 {generatedProposals.length} 种可选方案
                            </h3>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setPreviewType('list')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                                        previewType === 'list' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    列表视图
                                </button>
                                <button
                                    onClick={() => setPreviewType('table')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                                        previewType === 'table' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    表格对比
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {generatedProposals.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentProposalIndex(idx)}
                                    className={`px-3 py-1 text-sm rounded border ${
                                        currentProposalIndex === idx
                                            ? 'bg-purple-600 text-white border-purple-600'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    方案 {idx + 1}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto border rounded bg-gray-50 p-4 space-y-4">
                        {(() => {
                            const currentProposal = generatedProposals[currentProposalIndex];
                            
                            if (previewType === 'table') {
                                return (
                                    <ScheduleDiffTable
                                        students={students}
                                        oldAssignments={scheduleState.assignments}
                                        newAssignments={currentProposal}
                                        groupCount={numGroups}
                                    />
                                );
                            }

                            const changes = getDiff(scheduleState.assignments, currentProposal);
                            return (
                                <>
                                    <div className="bg-white p-3 rounded shadow-sm border">
                                        <div className="text-sm font-medium text-gray-700 mb-2">方案概览</div>
                                        <div className="text-sm text-gray-600">
                                            共 {changes.length} 人任务发生变动。
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {changes.map(({ student, oldTasks, newTasks }, idx) => (
                                            <div key={idx} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                                                <div className="flex items-baseline justify-between mb-1">
                                                    <span className="font-medium text-gray-900">
                                                        {student.grade}年{student.classNum}班 - {student.name}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {student.department}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div className="text-red-600 bg-red-50 p-2 rounded">
                                                        <div className="text-xs text-red-400 mb-1">变更前</div>
                                                        {oldTasks.length > 0 ? oldTasks.map(t => <div key={t}>{t}</div>) : '无任务'}
                                                    </div>
                                                    <div className="text-green-600 bg-green-50 p-2 rounded">
                                                        <div className="text-xs text-green-400 mb-1">变更后</div>
                                                        {newTasks.length > 0 ? newTasks.map(t => <div key={t}>{t}</div>) : '无任务'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
                        <button
                            onClick={() => setViewMode('input')}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition"
                        >
                            返回修改
                        </button>
                        <button
                            onClick={() => {
                                onGlobalReschedule(generatedProposals[currentProposalIndex]);
                                onClose();
                            }}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded shadow-sm transition"
                        >
                            确认应用此方案
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default SwapModal;
