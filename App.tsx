
import React, { useState, useRef, useEffect } from 'react';
import StudentList from './components/StudentList';
import ScheduleGrid from './components/ScheduleGrid';
import { MOCK_STUDENTS, ALL_TASKS } from './constants';
import { Student, Department } from './types';
import { autoScheduleMultiGroup } from './services/scheduler';
import { formatClassName } from './utils';
import { Download, Upload, Wand2, FileSpreadsheet, Image as ImageIcon, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import saveAs from 'file-saver';
// @ts-ignore
import { pinyin } from 'pinyin-pro';

const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  // Assignments key is `${taskId}::${groupIndex}`
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [groupCount, setGroupCount] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Init mock data with pinyin
  useEffect(() => {
    const enriched = MOCK_STUDENTS.map(s => ({
        ...s,
        pinyinInitials: pinyin(s.name, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
    }));
    setStudents(enriched);
  }, []);

  const handleAssign = (taskId: string, groupId: number, studentId: string | null) => {
    const key = `${taskId}::${groupId}`;
    setAssignments(prev => {
      const next = { ...prev };
      if (studentId === null) {
        delete next[key];
      } else {
        next[key] = studentId;
      }
      return next;
    });
  };

  const handleAutoSchedule = () => {
    // Schedule N groups
    const newSchedule = autoScheduleMultiGroup(students, assignments, groupCount);
    setAssignments(newSchedule);
    alert(`${groupCount}组自动编排完成！`);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newStudents: Student[] = data.map((row, idx) => {
        let grade = 1;
        let classNum = 1;
        
        const classStr = String(row['班级'] || '1-1');
        if (classStr.includes('-')) {
            const parts = classStr.split('-');
            grade = parseInt(parts[0]) || 1;
            classNum = parseInt(parts[1]) || 1;
        } else if (classStr.length === 3) {
             grade = parseInt(classStr[0]) || 1;
             classNum = parseInt(classStr.substring(1)) || 1;
        } else {
            // Try parsing chinese like "高二(1)"
            if(classStr.includes('高一') || classStr.includes('一')) grade = 1;
            if(classStr.includes('高二') || classStr.includes('二')) grade = 2;
            if(classStr.includes('高三') || classStr.includes('三')) grade = 3;
            const match = classStr.match(/\d+/);
            if(match) classNum = parseInt(match[0]);
        }

        const name = row['姓名'] || `Student ${idx}`;
        // Auto generate pinyin
        const py = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('');

        return {
            id: `imported-${idx}`,
            name: name,
            department: row['部门'] || Department.DISCIPLINE,
            grade,
            classNum,
            pinyinInitials: py
        };
      });

      setStudents(newStudents);
      setAssignments({}); 
      alert(`成功导入 ${newStudents.length} 人，已自动生成简拼`);
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 姓名: '张三', 部门: '纪检部', 班级: '2-1' },
      { 姓名: '李四', 部门: '主席团', 班级: '3-5' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "名单模板");
    XLSX.writeFile(wb, "学生会名单模板.xlsx");
  };

  const exportExcel = () => {
    // We need to export assignments for all groups
    const rows = ALL_TASKS.map(task => {
        const row: any = {
            category: task.category,
            sub: task.subCategory,
            name: task.name,
        };
        
        // Loop through current group count
        for (let g = 0; g < groupCount; g++) {
            const sid = assignments[`${task.id}::${g}`];
            const student = students.find(s => s.id === sid);
            row[`Group${g+1}`] = student ? `${student.name} (${formatClassName(student.grade, student.classNum)})` : '';
        }
        
        return row;
    });

    // Individual breakdown
    const individualRows: any[] = [];
    Object.keys(assignments).forEach(key => {
        const [tid, gStr] = key.split('::');
        const g = parseInt(gStr);
        // Only include if within current group count (in case we reduced groups after assigning)
        if(g >= groupCount) return;

        const sid = assignments[key];
        const student = students.find(s => s.id === sid);
        const task = ALL_TASKS.find(t => t.id === tid);
        if(student && task) {
            individualRows.push({
                Group: `第${g+1}组`,
                Grade: `高${student.grade}`,
                Class: formatClassName(student.grade, student.classNum),
                Name: student.name,
                Task: `${task.category} - ${task.subCategory} - ${task.name}`
            });
        }
    });

    individualRows.sort((a, b) => {
        if(a.Group !== b.Group) return a.Group.localeCompare(b.Group);
        if (a.Grade !== b.Grade) return a.Grade.localeCompare(b.Grade);
        return a.Class.localeCompare(b.Class);
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws1, "总表");
    const ws2 = XLSX.utils.json_to_sheet(individualRows);
    XLSX.utils.book_append_sheet(wb, ws2, "任务明细");

    XLSX.writeFile(wb, "检查安排表.xlsx");
  };

  const exportImage = async () => {
    const element = document.getElementById('schedule-export-area');
    if (element) {
      const canvas = await html2canvas(element, { scale: 2 });
      canvas.toBlob(blob => {
        if(blob) saveAs(blob, "检查安排表.png");
      });
    }
  };

  const exportJSON = () => {
    const data = {
        students,
        assignments,
        groupCount,
        date: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    saveAs(blob, "schedule_data.json");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
            <div className="bg-primary text-white p-2 rounded-lg font-bold text-xl">SU</div>
            <h1 className="font-bold text-xl text-gray-800">学生会检查编排系统</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-4 bg-gray-50 px-2 py-1 rounded border">
            <Users size={16} className="text-gray-500"/>
            <span className="text-sm text-gray-600">组数:</span>
            <select 
                value={groupCount}
                onChange={(e) => setGroupCount(Number(e.target.value))}
                className="bg-transparent text-sm font-medium outline-none cursor-pointer"
            >
                {[1,2,3,4,5,6].map(n => (
                    <option key={n} value={n}>{n} 组</option>
                ))}
            </select>
          </div>

          <button 
            onClick={downloadTemplate}
            className="text-xs text-blue-600 hover:underline mr-4"
          >
            下载模板
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xlsx,.xls" 
            onChange={handleExcelImport}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition"
          >
            <Upload size={16} /> 导入人员
          </button>

          <button 
            onClick={handleAutoSchedule}
            className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-blue-600 text-white rounded-md text-sm transition shadow-sm"
          >
            <Wand2 size={16} /> 智能编排
          </button>

          <div className="h-6 w-px bg-gray-300 mx-2"></div>

          <div className="flex bg-gray-100 rounded-md p-1">
             <button onClick={exportExcel} className="p-2 hover:bg-white rounded text-gray-600 hover:text-green-600 transition" title="导出Excel">
                <FileSpreadsheet size={18} />
             </button>
             <button onClick={exportImage} className="p-2 hover:bg-white rounded text-gray-600 hover:text-purple-600 transition" title="导出图片">
                <ImageIcon size={18} />
             </button>
             <button onClick={exportJSON} className="p-2 hover:bg-white rounded text-gray-600 hover:text-orange-600 transition" title="导出数据">
                <Download size={18} />
             </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <StudentList students={students} />

        {/* Removed overflow-hidden from the inner card to allow scrolling if needed, though main overflow-auto handles it. */}
        <main className="flex-1 overflow-auto bg-gray-100 p-6 flex justify-center">
            <div className="w-full max-w-[1400px] bg-white shadow-lg rounded-xl h-fit min-h-[500px]">
                <ScheduleGrid 
                  students={students} 
                  assignments={assignments} 
                  onAssign={handleAssign}
                  groupCount={groupCount}
                />
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
