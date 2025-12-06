
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ALL_TASKS } from '../constants';
import { Student, TaskCategory } from '../types';
import { canAssign } from '../services/scheduler';
import { X } from 'lucide-react';
import { formatClassName } from '../utils';
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  DragStartEvent, 
  DragEndEvent,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';
import { createPortal } from 'react-dom';

interface Props {
  students: Student[];
  assignments: Record<string, string>; // Key is taskId::groupId
  onAssign: (taskId: string, groupId: number, studentId: string | null) => void;
  onSwap?: (taskId1: string, groupId1: number, taskId2: string, groupId2: number) => void;
  groupCount: number;
}

const ScheduleGrid: React.FC<Props> = ({ students, assignments, onAssign, onSwap, groupCount }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag, allows clicks
      },
    })
  );
  
  // Generate group indices based on count
  const groups = useMemo(() => Array.from({ length: groupCount }, (_, i) => i), [groupCount]);
  
  // Group names helper
  const getGroupName = (idx: number) => {
      const map = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      return `第${map[idx] || (idx + 1)}组`;
  };

  // Group tasks for rendering
  const tasksByCategory = {
    [TaskCategory.CLEANING]: ALL_TASKS.filter(t => t.category === TaskCategory.CLEANING),
    [TaskCategory.INTERVAL_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.INTERVAL_EXERCISE),
    [TaskCategory.EYE_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.EYE_EXERCISE),
    [TaskCategory.EVENING_STUDY]: ALL_TASKS.filter(t => t.category === TaskCategory.EVENING_STUDY),
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    // Extract student info for overlay
    const [taskId, groupIdStr] = (active.id as string).split('::');
    const studentId = assignments[`${taskId}::${groupIdStr}`];
    const student = students.find(s => s.id === studentId);
    setActiveStudent(student || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
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
              当前编排：{groupCount} 组 | 支持拖拽或简拼输入（自动匹配首字母）
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
                  <th key={g} className="border border-gray-400 p-2 font-bold text-gray-700 min-w-[140px]">
                    {getGroupName(g)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(tasksByCategory).map(([category, tasks]) => {
                // We need to calculate row spans for SubCategories
                const subCatCounts: Record<string, number> = {};
                tasks.forEach(t => {
                  subCatCounts[t.subCategory] = (subCatCounts[t.subCategory] || 0) + 1;
                });
                
                // Track rendered subcats to avoid dupes
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
                      
                      <td className="border border-gray-400 p-2 text-gray-800 text-center">
                        {task.name}
                      </td>

                      {/* Render Groups */}
                      {groups.map(g => {
                        const key = `${task.id}::${g}`;
                        const studentId = assignments[key];
                        const student = students.find(s => s.id === studentId);
                        const validation = student ? canAssign(student, task) : { valid: true };

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
        <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeStudent ? (
             <div className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-lg shadow-xl border border-white/50 text-sm font-medium text-gray-800 transform scale-105 flex items-center gap-2 pointer-events-none">
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

// Wrapper to handle DnD and Rendering logic cleanly
const CellWrapper: React.FC<{
    id: string;
    student: Student | undefined;
    validation: { valid: boolean; reason?: string };
    onAssign: (sid: string | null) => void;
    allStudents: Student[];
    task: any;
    groupIndex: number;
}> = ({ id, student, validation, onAssign, allStudents, task, groupIndex }) => {
    const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
        id: id,
        disabled: !student // Only draggable if there is a student
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: id
    });

    return (
        <td 
            ref={setDroppableRef}
            className={`border border-gray-400 p-0 relative transition-all duration-200 ${
                !validation.valid ? 'bg-red-50' : 
                isOver ? 'bg-blue-100/50 shadow-inner' : 'bg-white'
            } ${isDragging ? 'opacity-30' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const sid = e.dataTransfer.getData('studentId');
                if (sid) onAssign(sid);
            }}
        >
            <div ref={setNodeRef} {...listeners} {...attributes} className="h-full w-full">
                <CellInput 
                    value={student} 
                    allStudents={allStudents}
                    onSelect={onAssign}
                    isValid={validation.valid}
                    validationMsg={validation.reason}
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
}> = ({ value, allStudents, onSelect, isValid, validationMsg }) => {
  const [query, setQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<Student[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      if (!query) {
        setSuggestions([]); 
        return;
      }
      const lowerQ = query.toLowerCase();
      const matches = allStudents.filter(s => 
        s.name.includes(query) || 
        (s.pinyinInitials && s.pinyinInitials.includes(lowerQ))
      ).slice(0, 5);
      setSuggestions(matches);
    }
  }, [query, isEditing, allStudents]);

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
          <div className="flex flex-col items-center leading-tight pointer-events-none"> {/* Pointer events none on text to ensure drag hits parent */}
            <span className={`text-sm font-medium ${isValid ? 'text-gray-900' : 'text-red-600'}`}>
              {getDisplayName(value)}
            </span>
            {!isValid && <span className="text-[10px] text-red-500 scale-75 origin-center">{validationMsg}</span>}
          </div>
          <button 
            onPointerDown={(e) => e.stopPropagation()} // Stop drag from starting on X button
            onClick={(e) => { e.stopPropagation(); onSelect(null); }}
            className="absolute right-1 top-1 opacity-0 group-hover/cell:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div 
            className="relative w-full h-full flex items-center"
            onPointerDown={(e) => e.stopPropagation()} // Stop drag propagation when editing
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
            />
            {isEditing && suggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 w-full bg-white shadow-lg border rounded-md mt-1 overflow-hidden min-w-[120px]">
                {suggestions.map(s => (
                <div 
                    key={s.id}
                    className="px-3 py-2 text-left hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0"
                    onMouseDown={() => onSelect(s.id)}
                >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.department} {formatClassName(s.grade, s.classNum)}</div>
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
