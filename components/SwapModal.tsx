import React, { useState, useEffect, useMemo } from 'react';
import { Student, ScheduleState, TaskDefinition, TaskCategory } from '../types';
import { ALL_TASKS } from '../constants';
import { findSwapOptions, SwapProposal } from '../services/swapService';
import Modal from './Modal';
import { autoScheduleMultiGroupAsync } from '../services/scheduler';
import { formatClassName } from '../utils';
import { ArrowRight, Check, Shuffle, Wand2, AlertCircle, Loader2, Table, List, ChevronRight, Search, Eye, ChevronDown } from 'lucide-react';

interface SwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    scheduleState: ScheduleState;
    numGroups: number;
    onApplySwap: (proposal: SwapProposal, studentId: string, originalTaskId: string, originalGroupId: number) => void;
    onGlobalReschedule: (newAssignments: Record<string, string>) => void;
}

interface SelectOption {
    value: string | number;
    label: string;
}

interface CustomSelectProps {
    value: string | number;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder, disabled, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => String(opt.value) === String(value));

    return (
        <div className={`relative ${className || ''}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between border rounded-lg p-2.5 bg-white transition-all ${
                    isOpen ? 'ring-2 ring-purple-500 border-purple-500' : 'border-gray-300 hover:border-gray-400'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <span className={`text-sm truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
                    {selectedOption ? selectedOption.label : placeholder || '请选择...'}
                </span>
                <ChevronDown size={16} className={`text-gray-500 shrink-0 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100 origin-top">
                    {options.length === 0 ? (
                        <div className="p-3 text-sm text-gray-400 text-center">无选项</div>
                    ) : (
                        <div className="p-1">
                            {options.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => {
                                        onChange(String(opt.value));
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                                        String(opt.value) === String(value)
                                            ? 'bg-purple-50 text-purple-700 font-medium'
                                            : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// 表格差异视图组件
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
        <div className="overflow-x-auto border rounded-lg shadow-sm bg-white">
            <table className="w-full border-collapse text-xs table-fixed min-w-[800px]">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="p-3 w-24 font-semibold text-gray-600 text-left border-r border-gray-100">项目</th>
                        <th className="p-3 w-20 font-semibold text-gray-600 text-left border-r border-gray-100">细项</th>
                        <th className="p-3 w-32 font-semibold text-gray-600 text-left border-r border-gray-100">内容</th>
                        {groups.map(g => (
                            <th key={g} className="p-3 font-semibold text-gray-600 border-r border-gray-100 last:border-r-0">
                                {getGroupName(g)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
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
                                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                                    {isFirstOfCategory && (
                                        <td className="p-3 font-medium text-gray-700 bg-gray-50/50 border-r border-gray-100 align-middle" rowSpan={tasks.length}>
                                            {category}
                                        </td>
                                    )}
                                    {isFirstOfSubCat && (
                                        <td className="p-3 text-gray-600 border-r border-gray-100 align-middle" rowSpan={subCatCounts[task.subCategory]}>
                                            {task.subCategory}
                                        </td>
                                    )}
                                    <td className="p-3 text-gray-800 border-r border-gray-100 truncate" title={task.name}>
                                        {task.name}
                                    </td>
                                    {groups.map(g => {
                                        const key = `${task.id}::${g}`;
                                        const oldSid = oldAssignments[key];
                                        const newSid = newAssignments[key];
                                        const isChanged = oldSid !== newSid;

                                        let bgClass = '';
                                        if (isChanged) {
                                            bgClass = 'bg-amber-50'; // 高亮变动的单元格
                                        }

                                        return (
                                            <td key={g} className={`p-2 border-r border-gray-100 last:border-r-0 align-middle ${bgClass}`}>
                                                {isChanged ? (
                                                    <div className="flex flex-col gap-1">
                                                        {oldSid && (
                                                            <div className="text-red-400 line-through text-[10px] opacity-75">
                                                                {getStudentName(oldSid)}
                                                            </div>
                                                        )}
                                                        {newSid && (
                                                            <div className="text-green-600 font-bold flex items-center gap-1">
                                                                <div className="w-1 h-1 rounded-full bg-green-500"></div>
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

    // 许愿模式状态
    const [wishCategory, setWishCategory] = useState<string>('');
    const [wishTaskId, setWishTaskId] = useState<string>('');
    const [wishGroupId, setWishGroupId] = useState<number>(0);
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculationStatus, setCalculationStatus] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [studentSearch, setStudentSearch] = useState<string>(''); // 学生搜索状态

    // 预览状态
    const [viewMode, setViewMode] = useState<'input' | 'preview'>('input');
    const [previewType, setPreviewType] = useState<'list' | 'table'>('list'); // 切换列表/表格
    const [generatedProposals, setGeneratedProposals] = useState<Record<string, string>[]>([]);
    const [currentProposalIndex, setCurrentProposalIndex] = useState<number>(0);

    // 打开/关闭模态框时重置状态
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
            setStudentSearch('');
            setViewMode('input');
            setPreviewType('list');
            setGeneratedProposals([]);
            setCurrentProposalIndex(0);
        }
    }, [isOpen]);

    // 获取所选学生的任务分配
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

    // 当选中学生和任务时计算选项（调换模式）
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
            // 克隆当前状态以尽量减少变动
            const currentAssignments = { ...scheduleState.assignments };
            const targetKey = `${wishTaskId}::${wishGroupId}`;

            // 1. 移除学生现有的分配（使他们可以自由移动）
            // 这将他们从旧组/任务中解锁
            Object.keys(currentAssignments).forEach(key => {
                if (currentAssignments[key] === selectedStudentId) {
                    delete currentAssignments[key];
                }
            });

            // 2. 移除目标插槽的分配（如果有）
            // 这将解锁当前的持有者（他们将被重新分配）
            if (currentAssignments[targetKey]) {
                delete currentAssignments[targetKey];
            }

            // 3. 强制许愿
            currentAssignments[targetKey] = selectedStudentId;

            // 运行 3 次尝试以找到不同的解决方案
            const attempts = 3;
            const results: Record<string, string>[] = [];

            for (let i = 0; i < attempts; i++) {
                setCalculationStatus(`正在计算方案 ${i + 1}/${attempts}...`);
                const newAssignments = await autoScheduleMultiGroupAsync(
                    students,
                    currentAssignments,
                    numGroups,
                    (log) => {
                         // 仅在状态更新时更新，避免过多的重新渲染
                         if (log.includes('初始化')) return;
                    }
                );

                if (newAssignments[targetKey] === selectedStudentId) {
                    // 严格检查：确保没有空缺
                    const totalSlots = ALL_TASKS.length * numGroups;
                    const assignedCount = Object.keys(newAssignments).length;

                    if (assignedCount < totalSlots) {
                        console.warn(`Attempt ${i+1} failed: Incomplete assignment (${assignedCount}/${totalSlots})`);
                        continue;
                    }

                    // 去重
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
                setPreviewType('list'); // 默认为列表视图
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

    // 计算差异的辅助函数
    const getDiff = (oldAssign: Record<string, string>, newAssign: Record<string, string>) => {
        const changes: { student: Student; oldTasks: string[]; newTasks: string[] }[] = [];
        
        students.forEach(student => {
            // 获取学生任务名称的辅助函数
            const getTasks = (assign: Record<string, string>) => {
                return Object.entries(assign)
                    .filter(([_, sid]) => sid === student.id)
                    .map(([key]) => {
                        const [taskId, gStr] = key.split('::');
                        const task = ALL_TASKS.find(t => t.id === taskId);
                        return task ? `[第${parseInt(gStr) + 1}组] ${task.name}` : '未知任务';
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

    // 可搜索的学生选择
    const filteredStudents = useMemo(() => {
        let list = [...students];

        // 搜索过滤
        if (studentSearch) {
            const lowerKey = studentSearch.toLowerCase();
            list = list.filter(s =>
                s.name.includes(lowerKey) ||
                (s.pinyinInitials && s.pinyinInitials.toLowerCase().includes(lowerKey)) ||
                (s.grade + '' === lowerKey) ||
                (s.classNum + '' === lowerKey)
            );
        }

        // 排序：部门 -> 年级 -> 班级
        return list.sort((a, b) => {
            if (a.department !== b.department) return a.department.localeCompare(b.department, 'zh-CN');
            if (a.grade !== b.grade) return a.grade - b.grade;
            return a.classNum - b.classNum;
        });
    }, [students, studentSearch]);

    // 按类别分组任务
    const tasksByCategory = useMemo(() => {
        const groups: Record<string, TaskDefinition[]> = {};
        ALL_TASKS.forEach(t => {
            if (!groups[t.category]) groups[t.category] = [];
            groups[t.category].push(t);
        });
        return groups;
    }, []);

    // 过滤任务列表（基于学生部门权限）
    const getAvailableTasks = (category: string, studentId: string) => {
        const student = students.find(s => s.id === studentId);
        if (!student) return [];
        
        const tasks = tasksByCategory[category] || [];
        return tasks.filter(t => t.allowedDepartments.includes(student.department));
    };

    // 快速调换预览处理
    const handleQuickSwapPreview = (proposal: SwapProposal) => {
        // 1. 复制当前分配
        const newAssignments = { ...scheduleState.assignments };
        const targetKey = `${proposal.targetTaskId}::${proposal.targetGroupId}`;
        
        // 2. 如果是移动，移除原任务（如果有）
        if (selectedTaskKey) {
            const [currentTaskId, currentGroupIdStr] = selectedTaskKey.split('::');
            const currentGroupId = parseInt(currentGroupIdStr);
            const currentKey = `${currentTaskId}::${currentGroupId}`;
            
            if (newAssignments[currentKey] === selectedStudentId) {
                delete newAssignments[currentKey];
            }

            // 3. 如果是直接交换，还需要处理对方
            if (proposal.type === 'DIRECT_SWAP' && proposal.targetStudentId) {
                 // 将对方分配到我的原任务
                 newAssignments[currentKey] = proposal.targetStudentId;
            }
        }

        // 4. 将我分配到新任务
        newAssignments[targetKey] = selectedStudentId;

        // 5. 设置预览状态
        setGeneratedProposals([newAssignments]);
        setCurrentProposalIndex(0);
        setViewMode('preview');
        setPreviewType('table');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="智能调换建议" width="w-[1000px]">
            {viewMode === 'input' ? (
                <div className="flex flex-col h-[600px]">
                    {/* 模式切换器 */}
                    <div className="flex p-1 mb-6 bg-gray-100 rounded-lg self-start">
                        <button
                            onClick={() => setMode('swap')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                                mode === 'swap' 
                                    ? 'bg-white text-blue-600 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Shuffle size={16} />
                            快速调换
                        </button>
                        <button
                            onClick={() => setMode('wish')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                                mode === 'wish' 
                                    ? 'bg-white text-purple-600 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Wand2 size={16} />
                            智能调换
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-1 pr-2 space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">选择学生</label>
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="搜索姓名、拼音首字母、年级或班级..."
                                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-shadow"
                                        value={studentSearch}
                                        onChange={(e) => setStudentSearch(e.target.value)}
                                    />
                                </div>
                                <div className="max-h-[180px] overflow-y-auto border border-gray-300 rounded-lg bg-white custom-scrollbar shadow-sm">
                                    {filteredStudents.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                                            <Search size={24} className="opacity-20" />
                                            <span>未找到匹配的学生</span>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-50">
                                            {filteredStudents.map((s, index) => {
                                                const showHeader = index === 0 || s.department !== filteredStudents[index - 1].department;
                                                return (
                                                    <React.Fragment key={s.id}>
                                                        {showHeader && (
                                                            <div className="sticky top-0 z-10 px-4 py-1.5 bg-gray-100 text-xs font-bold text-gray-500 border-y border-gray-200">
                                                                {s.department}
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setSelectedStudentId(s.id);
                                                                setSelectedTaskKey('');
                                                            }}
                                                            className={`w-full px-4 py-2.5 text-left text-sm transition-all hover:bg-gray-50 flex items-center justify-between group ${
                                                                selectedStudentId === s.id 
                                                                    ? 'bg-blue-50/80 text-blue-700 font-medium' 
                                                                    : 'text-gray-700'
                                                            }`}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${selectedStudentId === s.id ? 'bg-blue-500' : 'bg-gray-300 group-hover:bg-gray-400'}`}></span>
                                                                {formatClassName(s.grade, s.classNum)} <span className="text-gray-300 mx-1">|</span> {s.name}
                                                            </span>
                                                            {selectedStudentId === s.id && <Check size={16} className="text-blue-600 animate-in zoom-in duration-200" />}
                                                        </button>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {mode === 'swap' && (
                            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                                {selectedStudentId && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">选择希望更换的当前任务</label>
                                        {studentAssignments.length === 0 ? (
                                            <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500 text-center text-sm">
                                                该学生当前没有分配任何任务
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-3">
                                                {studentAssignments.map(({ task, groupId, key }) => (
                                                    <button
                                                        key={key}
                                                        className={`group relative p-4 text-left border rounded-xl transition-all duration-200 ${
                                                            selectedTaskKey === key
                                                                ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                                                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                                        }`}
                                                        onClick={() => setSelectedTaskKey(key)}
                                                    >
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="font-bold text-gray-800">第{groupId + 1}组</span>
                                                            <span className="text-xs font-medium px-2 py-1 bg-white border rounded text-gray-500">
                                                                {task.category}
                                                            </span>
                                                        </div>
                                                        <div className="text-gray-600 text-sm">{task.name}</div>
                                                        <div className="text-xs text-gray-400 mt-1">{task.timeSlot}</div>
                                                        
                                                        {selectedTaskKey === key && (
                                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500">
                                                                <Check size={20} />
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectedTaskKey && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            可用的调换方案 ({options.length})
                                        </label>
                                        <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                                            {options.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                                                    <AlertCircle className="mb-2 opacity-50" />
                                                    <span className="text-sm">未找到无冲突的调换方案</span>
                                                </div>
                                            ) : (
                                                options.map((opt, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="group bg-white p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-blue-200 transition-all flex justify-between items-center gap-4"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                                                                    opt.type === 'MOVE_TO_EMPTY' 
                                                                        ? 'bg-green-100 text-green-700' 
                                                                        : 'bg-blue-100 text-blue-700'
                                                                }`}>
                                                                    {opt.type === 'MOVE_TO_EMPTY' ? '直接移动' : '人员互换'}
                                                                </span>
                                                            </div>
                                                            <div className="text-sm font-medium text-gray-900 leading-relaxed">
                                                                {opt.description}
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 duration-200">
                                                            <button
                                                                onClick={() => handleQuickSwapPreview(opt)}
                                                                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                                                title="预览变更效果"
                                                            >
                                                                <Eye size={14} className="text-gray-500" /> 预览
                                                            </button>
                                                            <button
                                                                onClick={() => handleApply(opt)}
                                                                className="flex items-center gap-1 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-colors shadow-sm"
                                                            >
                                                                应用 <ArrowRight size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {mode === 'wish' && selectedStudentId && (
                            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-gradient-to-r from-purple-50 to-white p-4 rounded-xl border border-purple-100 text-sm text-purple-800 flex items-start gap-3">
                                    <Wand2 className="shrink-0 mt-0.5 text-purple-500" size={18} />
                                    <div>
                                        <strong className="font-semibold block mb-1">智能调换功能说明</strong>
                                        <p className="opacity-90 leading-relaxed">
                                            此功能会强制将所选任务分配给该学生，并尝试智能重新编排其他所有人的任务以解决冲突。
                                            系统会生成多个方案供您选择。注意：这可能会导致其他人员的安排发生变动。
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="z-30">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">目标组别</label>
                                        <CustomSelect
                                            value={wishGroupId}
                                            onChange={(val) => setWishGroupId(parseInt(val))}
                                            options={Array.from({ length: numGroups }).map((_, idx) => ({
                                                value: idx,
                                                label: `第 ${idx + 1} 组`
                                            }))}
                                        />
                                    </div>
                                    <div className="z-30">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">任务类型</label>
                                        <CustomSelect
                                            value={wishCategory}
                                            onChange={(val) => {
                                                setWishCategory(val);
                                                setWishTaskId('');
                                            }}
                                            placeholder="请选择类型..."
                                            options={Object.keys(tasksByCategory)
                                                .filter(cat => getAvailableTasks(cat, selectedStudentId).length > 0)
                                                .map(cat => ({
                                                    value: cat,
                                                    label: cat
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                {wishCategory && (
                                    <div className="animate-in fade-in z-20">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">具体任务</label>
                                        <CustomSelect
                                            value={wishTaskId}
                                            onChange={(val) => setWishTaskId(val)}
                                            placeholder="请选择任务..."
                                            options={getAvailableTasks(wishCategory, selectedStudentId).map(t => ({
                                                value: t.id,
                                                label: `${t.subCategory} - ${t.name}`
                                            }))}
                                        />
                                    </div>
                                )}

                                <div className="pt-2 space-y-3">
                                    {errorMessage && (
                                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 animate-in shake">
                                            <AlertCircle size={16} />
                                            {errorMessage}
                                        </div>
                                    )}
                                    
                                    {isCalculating ? (
                                        <div className="flex flex-col items-center justify-center py-6 bg-gray-50 rounded-lg border border-gray-100">
                                            <Loader2 className="animate-spin text-purple-600 mb-3" size={24} />
                                            <div className="text-purple-700 font-medium mb-1">正在计算重排方案...</div>
                                            <div className="text-xs text-gray-500 truncate px-4 max-w-full" title={calculationStatus}>
                                                {calculationStatus}
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleWishReschedule}
                                            disabled={!wishTaskId}
                                            className="w-full py-3.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow transition-all flex justify-center items-center gap-2"
                                        >
                                            <Wand2 size={18} />
                                            尝试生成多种方案
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col h-[700px]">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b">
                        <div className="flex items-center gap-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Check className="text-green-500" size={20} />
                                已生成 {generatedProposals.length} 种可选方案
                            </h3>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setPreviewType('list')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                        previewType === 'list' 
                                            ? 'bg-white shadow text-gray-800' 
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <List size={14} />
                                    列表视图
                                </button>
                                <button
                                    onClick={() => setPreviewType('table')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                        previewType === 'table' 
                                            ? 'bg-white shadow text-gray-800' 
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <Table size={14} />
                                    表格对比
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {generatedProposals.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentProposalIndex(idx)}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                                        currentProposalIndex === idx
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    方案 {idx + 1}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 custom-scrollbar">
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
                                <div className="space-y-3">
                                    {changes.length === 0 ? (
                                        <div className="text-center py-10 text-gray-500">
                                            没有检测到变动
                                        </div>
                                    ) : (
                                        changes.map((change, idx) => (
                                            <div key={idx} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-start gap-4">
                                                <div className="min-w-[140px] font-medium text-gray-900 pt-1">
                                                    {change.student.name}
                                                    <span className="text-xs text-gray-500 ml-2 block font-normal">
                                                        {formatClassName(change.student.grade, change.student.classNum)}
                                                    </span>
                                                </div>
                                                
                                                <div className="flex-1 grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                                                    <div className="space-y-1">
                                                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">当前任务</div>
                                                        {change.oldTasks.length > 0 ? (
                                                            change.oldTasks.map(t => (
                                                                <div key={t} className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100 inline-block mr-1 mb-1">
                                                                    {t}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <span className="text-sm text-gray-400 italic">无任务</span>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="text-gray-300">
                                                        <ArrowRight size={20} />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="text-xs text-green-600/70 mb-1 uppercase tracking-wider">新分配</div>
                                                        {change.newTasks.length > 0 ? (
                                                            change.newTasks.map(t => (
                                                                <div key={t} className="text-sm text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100 inline-block mr-1 mb-1 font-medium">
                                                                    {t}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <span className="text-sm text-gray-400 italic">无任务</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t">
                        <button
                            onClick={() => {
                                setViewMode('input');
                                setGeneratedProposals([]);
                            }}
                            className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            返回修改
                        </button>
                        <button
                            onClick={() => {
                                onGlobalReschedule(generatedProposals[currentProposalIndex]);
                                onClose();
                            }}
                            className="px-5 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-black shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                        >
                            <Check size={18} />
                            确认应用方案 {currentProposalIndex + 1}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default SwapModal;
