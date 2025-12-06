
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ALL_TASKS } from '../constants';
import { Student, TaskCategory } from '../types';
import { canAssign } from '../services/scheduler';
import { X } from 'lucide-react';
import { formatClassName } from '../utils';

interface Props {
  students: Student[];
  assignments: Record<string, string>; // Key is taskId::groupId
  onAssign: (taskId: string, groupId: number, studentId: string | null) => void;
  groupCount: number;
}

const ScheduleGrid: React.FC<Props> = ({ students, assignments, onAssign, groupCount }) => {
  
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

  return (
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
                        <td 
                          key={g}
                          className={`border border-gray-400 p-0 relative transition-colors ${
                            !validation.valid ? 'bg-red-50' : 'bg-white'
                          }`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const sid = e.dataTransfer.getData('studentId');
                            if (sid) onAssign(task.id, g, sid);
                          }}
                        >
                          <CellInput 
                            value={student} 
                            allStudents={students}
                            onSelect={(sid) => onAssign(task.id, g, sid)}
                            isValid={validation.valid}
                            validationMsg={validation.reason}
                          />
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
    </div>
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
            key={value.id} // Add key to trigger re-render animation
            className="flex items-center justify-center w-full cursor-pointer group/cell h-full animate-pop-in"
            onClick={() => {
                setIsEditing(true);
                setQuery(value.name);
                setTimeout(() => inputRef.current?.focus(), 0);
            }}
        >
          <div className="flex flex-col items-center leading-tight">
            <span className={`text-sm font-medium ${isValid ? 'text-gray-900' : 'text-red-600'}`}>
              {getDisplayName(value)}
            </span>
            {!isValid && <span className="text-[10px] text-red-500 scale-75 origin-center">{validationMsg}</span>}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onSelect(null); }}
            className="absolute right-1 top-1 opacity-0 group-hover/cell:opacity-100 text-gray-400 hover:text-red-500"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="relative w-full h-full flex items-center">
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
