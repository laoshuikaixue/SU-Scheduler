
import React, { useState } from 'react';
import { Student, Department } from '../types';
import { User, Search } from 'lucide-react';
import { formatClassName } from '../utils';

interface Props {
  students: Student[];
}

const StudentList: React.FC<Props> = ({ students }) => {
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
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
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
              <span className="font-medium text-gray-800">{student.name}</span>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                {formatClassName(student.grade, student.classNum)}
              </span>
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
    case Department.CHAIRMAN: return '#f59e0b'; // Amber
    case Department.DISCIPLINE: return '#ef4444'; // Red
    case Department.STUDY: return '#3b82f6'; // Blue
    case Department.ART: return '#ec4899'; // Pink
    case Department.CLUBS: return '#8b5cf6'; // Purple
    case Department.SPORTS: return '#10b981'; // Emerald
    default: return '#94a3b8';
  }
};

export default StudentList;
