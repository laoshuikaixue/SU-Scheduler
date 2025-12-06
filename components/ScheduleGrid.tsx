import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ALL_TASKS} from '../constants';
import {Student, TaskCategory} from '../types';
import {canAssign, checkGroupAvailability, ConflictInfo} from '../services/scheduler';
import {X} from 'lucide-react';
import {formatClassName} from '../utils';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import {createPortal} from 'react-dom';

interface Props {
    students: Student[];
    assignments: Record<string, string>; // 键是 taskId::groupId
    onAssign: (taskId: string, groupId: number, studentId: string | null) => void;
    onSwap?: (taskId1: string, groupId1: number, taskId2: string, groupId2: number) => void;
    groupCount: number;
    conflicts?: ConflictInfo[];
    enableMerge?: boolean;
}

const ScheduleGrid: React.FC<Props> = ({students, assignments, onAssign, onSwap, groupCount, conflicts = [], enableMerge = false}) => {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeStudent, setActiveStudent] = useState<Student | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 移动 8px 开始拖动，允许点击
            },
        })
    );

    // 根据数量生成组索引
    const groups = useMemo(() => Array.from({length: groupCount}, (_, i) => i), [groupCount]);

    // 组名辅助函数
    const getGroupName = (idx: number) => {
        const map = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        return `第${map[idx] || (idx + 1)}组`;
    };

    // 分组任务用于渲染
    const tasksByCategory = useMemo(() => ({
        [TaskCategory.CLEANING]: ALL_TASKS.filter(t => t.category === TaskCategory.CLEANING),
        [TaskCategory.INTERVAL_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.INTERVAL_EXERCISE),
        [TaskCategory.EYE_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.EYE_EXERCISE),
        [TaskCategory.EVENING_STUDY]: ALL_TASKS.filter(t => t.category === TaskCategory.EVENING_STUDY),
    }), []);

    // 计算合并信息
    const mergeInfo = useMemo(() => {
        if (!enableMerge) return {};

        const info: Record<string, { rowSpan: number; hidden: boolean }> = {};

        // 按类别遍历
        Object.values(tasksByCategory).forEach(categoryTasks => {
            // 按子类别分组
            const subCategoryTasks: Record<string, any[]> = {};
            categoryTasks.forEach(t => {
                if (!subCategoryTasks[t.subCategory]) subCategoryTasks[t.subCategory] = [];
                subCategoryTasks[t.subCategory].push(t);
            });

            // 在每个子类别内部进行合并计算
            Object.values(subCategoryTasks).forEach(tasks => {
                for (let g = 0; g < groupCount; g++) {
                    let i = 0;
                    while (i < tasks.length) {
                        const task = tasks[i];
                        const key = `${task.id}::${g}`;
                        const studentId = assignments[key];

                        if (!studentId) {
                            // 无人分配，不合并
                            info[key] = { rowSpan: 1, hidden: false };
                            i++;
                            continue;
                        }

                        let span = 1;
                        // 向下查找相同的人
                        while (i + span < tasks.length) {
                            const nextTask = tasks[i + span];
                            const nextKey = `${nextTask.id}::${g}`;
                            const nextStudentId = assignments[nextKey];

                            if (nextStudentId === studentId) {
                                span++;
                            } else {
                                break;
                            }
                        }

                        // 记录合并信息
                        info[key] = { rowSpan: span, hidden: false };
                        for (let j = 1; j < span; j++) {
                            const hiddenTask = tasks[i + j];
                            const hiddenKey = `${hiddenTask.id}::${g}`;
                            info[hiddenKey] = { rowSpan: 0, hidden: true };
                        }

                        i += span;
                    }
                }
            });
        });

        return info;
    }, [tasksByCategory, assignments, groupCount, enableMerge]);

    // 找到每个组组长出现的第一个任务ID
    const leaderFirstTaskIds = useMemo(() => {
        const result: Record<number, string> = {};
        
        // 遍历每一组
        for (let g = 0; g < groupCount; g++) {
            // 按顺序遍历所有任务
            for (const task of ALL_TASKS) {
                const key = `${task.id}::${g}`;
                const studentId = assignments[key];
                if (studentId) {
                    const student = students.find(s => s.id === studentId);
                    if (student?.isLeader) {
                        result[g] = task.id;
                        break; // 找到该组组长的第一个任务，记录并跳出，只标记第一个
                    }
                }
            }
        }
        return result;
    }, [assignments, students, groupCount]);

    const handleDragStart = (event: DragStartEvent) => {
        const {active} = event;
        setActiveId(active.id as string);

        // 提取学生信息用于覆盖层
        const [taskId, groupIdStr] = (active.id as string).split('::');
        const studentId = assignments[`${taskId}::${groupIdStr}`];
        const student = students.find(s => s.id === studentId);
        setActiveStudent(student || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;

        if (over && active.id !== over.id && onSwap) {
            const [t1, g1] = (active.id as string).split('::');
            const [t2, g2] = (over.id as string).split('::');

            onSwap(t1, parseInt(g1), t2, parseInt(g2));
        }

        setActiveId(null);
        setActiveStudent(null);
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div id="schedule-export-area" className="bg-white p-8 shadow-sm min-h-full">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">学生会常规检查安排表</h1>
                    <p id="schedule-description" className="text-gray-500 text-sm mt-1">
                        当前编排：{groupCount} 组
                    </p>
                </div>

                <div className="overflow-x-auto p-1">
                    <table className="w-full border-collapse border border-gray-400 text-sm table-fixed min-w-[800px]">
                        <thead>
                        <tr className="bg-gray-50">
                            <th className="border border-gray-400 p-2 w-24 font-bold text-gray-700">项目</th>
                            <th className="border border-gray-400 p-2 w-20 font-bold text-gray-700">细项</th>
                            <th className="border border-gray-400 p-2 w-24 font-bold text-gray-700">检查内容</th>
                            {groups.map(g => (
                                <th key={g}
                                    className="border border-gray-400 p-2 font-bold text-gray-700 min-w-[140px]">
                                    {getGroupName(g)}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody>
                        {Object.entries(tasksByCategory).map(([category, tasks]) => {
                            // 我们需要计算子类别的行跨度
                            const subCatCounts: Record<string, number> = {};
                            tasks.forEach(t => {
                                subCatCounts[t.subCategory] = (subCatCounts[t.subCategory] || 0) + 1;
                            });

                            // 跟踪已渲染的子类别以避免重复
                            const renderedSubCats: Record<string, boolean> = {};

                            return tasks.map((task, index) => {
                                const isFirstOfCategory = index === 0;
                                const isFirstOfSubCat = !renderedSubCats[task.subCategory];
                                if (isFirstOfSubCat) renderedSubCats[task.subCategory] = true;

                                const subCatRowSpan = subCatCounts[task.subCategory];

                                return (
                                    <tr key={task.id} className="hover:bg-gray-50">
                                        {isFirstOfCategory && (
                                            <td
                                                className="border border-gray-400 p-3 font-bold text-gray-700 bg-white align-middle text-center"
                                                rowSpan={tasks.length}
                                            >
                                                {category}
                                            </td>
                                        )}
                                        {isFirstOfSubCat && (
                                            <td
                                                className="border border-gray-400 p-3 text-gray-700 text-center align-middle"
                                                rowSpan={subCatRowSpan}
                                            >
                                                {task.subCategory}
                                            </td>
                                        )}

                                        <td className="border border-gray-400 p-2 text-gray-800 text-center align-middle">
                                            {task.name}
                                        </td>

                                        {/* 渲染组 */}
                                        {groups.map(g => {
                                            const key = `${task.id}::${g}`;
                                            const merge = mergeInfo[key];

                                            if (merge?.hidden) return null;

                                            const studentId = assignments[key];
                                            const student = students.find(s => s.id === studentId);
                                            const validation = student ? canAssign(student, task) : {valid: true};

                                            // 查找当前单元格的冲突
                                            const cellConflict = conflicts.find(c =>
                                                c.taskId === task.id &&
                                                c.groupId === g &&
                                                c.studentId === studentId
                                            );

                                            return (
                                                <CellWrapper
                                                    key={g}
                                                    id={key}
                                                    student={student}
                                                    validation={validation}
                                                    onAssign={(sid) => onAssign(task.id, g, sid)}
                                                    allStudents={students}
                                                    task={task}
                                                    groupIndex={g}
                                                    conflict={cellConflict}
                                                    assignments={assignments}
                                                    isFirstLeaderOccurrence={leaderFirstTaskIds[g] === task.id}
                                                    rowSpan={merge?.rowSpan || 1}
                                                />
                                            );
                                        })}
                                    </tr>
                                );
                            });
                        })}
                        </tbody>
                    </table>
                </div>
            </div>

            {createPortal(
                <DragOverlay dropAnimation={{duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)'}}>
                    {activeStudent ? (
                        <div
                            className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-lg shadow-xl border border-white/50 text-sm font-medium text-gray-800 transform scale-105 flex items-center gap-2 pointer-events-none">
                            <span>{formatClassName(activeStudent.grade, activeStudent.classNum)}</span>
                            <span>{activeStudent.name}</span>
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
};

// 包装器以清晰处理拖拽和渲染逻辑
const CellWrapper: React.FC<{
    id: string;
    student: Student | undefined;
    validation: { valid: boolean; reason?: string };
    onAssign: (sid: string | null) => void;
    allStudents: Student[];
    task: any;
    groupIndex: number;
    conflict?: ConflictInfo;
    assignments: Record<string, string>;
    isFirstLeaderOccurrence?: boolean;
    rowSpan?: number;
}> = ({id, student, validation, onAssign, allStudents, task, groupIndex, conflict, assignments, isFirstLeaderOccurrence, rowSpan = 1}) => {
    const {setNodeRef, attributes, listeners, isDragging} = useDraggable({
        id: id,
        disabled: !student // 仅当有学生时可拖拽
    });

    const {setNodeRef: setDroppableRef, isOver} = useDroppable({
        id: id
    });

    // 根据状态确定背景颜色
    let bgClass = 'bg-white';
    if (isDragging) {
        bgClass = 'opacity-30';
    } else if (student?.isLeader && isFirstLeaderOccurrence) {
        // 组长高亮 (优先显示)
        bgClass = 'bg-yellow-200';
    } else if (isOver) {
        bgClass = 'bg-blue-100/50 shadow-inner';
    } else if (conflict && conflict.type !== 'error') {
        // 仅保留警告背景
        bgClass = 'bg-yellow-50';
    }

    return (
        <td
            ref={setDroppableRef}
            className={`border border-gray-400 p-0 relative transition-all duration-200 align-middle ${bgClass}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const sid = e.dataTransfer.getData('studentId');
                if (sid) onAssign(sid);
            }}
            rowSpan={rowSpan}
        >
            <div ref={setNodeRef} {...listeners} {...attributes} className="h-full w-full">
                <CellInput
                    value={student}
                    allStudents={allStudents}
                    onSelect={onAssign}
                    isValid={!conflict && validation.valid}
                    validationMsg={conflict ? conflict.reason : validation.reason}
                    task={task}
                    groupIndex={groupIndex}
                    assignments={assignments}
                />
            </div>
        </td>
    );
};

const CellInput: React.FC<{
    value: Student | undefined;
    allStudents: Student[];
    onSelect: (id: string | null) => void;
    isValid: boolean;
    validationMsg?: string;
    task: any;
    groupIndex: number;
    assignments: Record<string, string>;
}> = ({value, allStudents, onSelect, isValid, validationMsg, task, groupIndex, assignments}) => {
    const [query, setQuery] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [suggestions, setSuggestions] = useState<Student[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) {
            let newSuggestions: Student[] = [];
            if (!query) {
                newSuggestions = allStudents.filter(s => {
                    const check = checkGroupAvailability(s, task, groupIndex, assignments);
                    return check.valid;
                }).slice(0, 5);
            } else {
                const lowerQ = query.toLowerCase();
                newSuggestions = allStudents.filter(s => {
                    const nameMatch = s.name.includes(query) || (s.pinyinInitials && s.pinyinInitials.includes(lowerQ));
                    if (!nameMatch) return false;

                    // 同时也检查搜索结果的基本有效性（可选，但用户体验更好）
                    return canAssign(s, task).valid;
                }).slice(0, 5);
            }
            setSuggestions(newSuggestions);
            setSelectedIndex(0);
        }
    }, [query, isEditing, allStudents, task, groupIndex, assignments]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isEditing || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestions[selectedIndex]) {
                onSelect(suggestions[selectedIndex].id);
                inputRef.current?.blur();
            }
        }
    };

    const handleBlur = () => {
        setTimeout(() => {
            setIsEditing(false);
            setQuery('');
        }, 200);
    };

    const getDisplayName = (s: Student) => {
        return `${formatClassName(s.grade, s.classNum)} ${s.name}`;
    };

    return (
        <div className="relative h-full w-full p-1 min-h-[40px] flex items-center justify-center">
            {value && !isEditing ? (
                <div
                    key={value.id}
                    className="flex items-center justify-center w-full cursor-grab active:cursor-grabbing group/cell h-full animate-pop-in"
                    onClick={() => {
                        setIsEditing(true);
                        setQuery(value.name);
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                >
                    <div
                        className="flex flex-col items-center leading-tight pointer-events-none"> {/* 文本上的指针事件设为none以确保拖拽命中父元素 */}
                        <span className={`text-sm font-medium ${isValid ? 'text-gray-900' : 'text-red-600'}`}>
              {getDisplayName(value)}
            </span>
                        {!isValid &&
                            <span className="validation-msg text-[10px] text-red-500 scale-75 origin-center">{validationMsg}</span>}
                    </div>
                    <button
                        onPointerDown={(e) => e.stopPropagation()} // 阻止从X按钮开始拖拽
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(null);
                        }}
                        className="absolute right-1 top-1 opacity-0 group-hover/cell:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer"
                    >
                        <X size={12}/>
                    </button>
                </div>
            ) : (
                <div
                    className="relative w-full h-full flex items-center"
                    onPointerDown={(e) => e.stopPropagation()} // 编辑时阻止拖拽传播
                >
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full h-full text-center outline-none bg-transparent placeholder-gray-300 text-sm"
                        placeholder={isEditing ? '' : ""}
                        value={isEditing ? query : ''}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsEditing(true)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                    />
                    {isEditing && suggestions.length > 0 && (
                        <div
                            className="absolute z-50 top-full left-0 w-full bg-white shadow-lg border rounded-md mt-1 overflow-hidden min-w-[120px]">
                            {suggestions.map((s, index) => (
                                <div
                                    key={s.id}
                                    className={`px-3 py-2 text-left cursor-pointer text-sm border-b last:border-0 ${index === selectedIndex ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                                    onMouseDown={() => onSelect(s.id)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <div className="font-medium">{s.name}</div>
                                    <div
                                        className="text-xs text-gray-500">{s.department} {formatClassName(s.grade, s.classNum)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ScheduleGrid;
