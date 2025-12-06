import React, {useState} from 'react';
import {Department, Student} from '../types';
import {Search, User, Crown} from 'lucide-react';
import {formatClassName} from '../utils';

interface Props {
    students: Student[];
    taskCounts: Record<string, number>;
    onToggleLeader?: (studentId: string) => void;
}

const StudentList: React.FC<Props> = ({students, taskCounts, onToggleLeader}) => {
    const [filter, setFilter] = useState('');

    const onDragStart = (e: React.DragEvent, studentId: string) => {
        e.dataTransfer.setData('studentId', studentId);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const filteredStudents = students.filter(s =>
        s.name.includes(filter) ||
        s.department.includes(filter) ||
        (s.pinyinInitials && s.pinyinInitials.includes(filter.toLowerCase()))
    );

    return (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
            <div className="p-4 border-b border-gray-200">
                <h2 className="font-bold text-gray-700 mb-2">人员列表 ({students.length})</h2>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400"/>
                    <input
                        type="text"
                        placeholder="搜姓名/部门/简拼..."
                        className="w-full pl-8 pr-2 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredStudents.map(student => (
                    <div
                        key={student.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, student.id)}
                        className="p-3 bg-white border rounded-lg shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing border-l-4 transition-all"
                        style={{
                            borderLeftColor: getDeptColor(student.department)
                        }}
                    >
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1">
                                <span className="font-medium text-gray-800">{student.name}</span>
                                <button
                                    onClick={(e) => {
                                        // 阻止拖拽和事件冒泡
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onToggleLeader?.(student.id);
                                    }}
                                    className={`p-0.5 rounded-full hover:bg-gray-100 transition-colors ${student.isLeader ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
                                    title={student.isLeader ? "取消组长" : "设为组长"}
                                    onMouseDown={(e) => e.stopPropagation()} // 防止触发拖拽
                                >
                                    <Crown size={14} fill={student.isLeader ? "currentColor" : "none"} />
                                </button>
                            </div>
                            <div className="flex items-center gap-1">
                                {(taskCounts[student.id] || 0) > 0 && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium min-w-[20px] text-center" title="当前分配任务数">
                                        {taskCounts[student.id]}
                                    </span>
                                )}
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                                    {formatClassName(student.grade, student.classNum)}
                                </span>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center">
                            <User size={12} className="mr-1"/> {student.department}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const getDeptColor = (dept: Department) => {
    switch (dept) {
        case Department.CHAIRMAN:
            return '#f59e0b'; // 琥珀色
        case Department.DISCIPLINE:
            return '#ef4444'; // 红色
        case Department.STUDY:
            return '#3b82f6'; // 蓝色
        case Department.ART:
            return '#ec4899'; // 粉色
        case Department.CLUBS:
            return '#8b5cf6'; // 紫色
        case Department.SPORTS:
            return '#10b981'; // 翠绿色
        default:
            return '#94a3b8';
    }
};

export default StudentList;
