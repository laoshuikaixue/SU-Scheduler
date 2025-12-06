
import React, { useState, useRef, useEffect } from 'react';
import StudentList from './components/StudentList';
import ScheduleGrid from './components/ScheduleGrid';
import Toast from './components/Toast';
import { MOCK_STUDENTS, ALL_TASKS } from './constants';
import { Student, Department, TaskCategory } from './types';
import { autoScheduleMultiGroup } from './services/scheduler';
import { formatClassName } from './utils';
import { Download, Upload, Wand2, FileSpreadsheet, Image as ImageIcon, Users, FileText } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import saveAs from 'file-saver';
// @ts-ignore
import { pinyin } from 'pinyin-pro';

const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  // Assignments key is `${taskId}::${groupIndex}`
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [groupCount, setGroupCount] = useState(3);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  // Export Dialog State
  const [exportDialog, setExportDialog] = useState<{ isOpen: boolean, type: 'excel' | 'image' | null }>({ isOpen: false, type: null });
  const [includePersonalList, setIncludePersonalList] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

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
    // Schedule N groups - Pass empty object to force fresh calculation
    const newSchedule = autoScheduleMultiGroup(students, {}, groupCount);
    setAssignments(newSchedule);
    showToast(`${groupCount}组自动编排完成！`);
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
      showToast(`成功导入 ${newStudents.length} 人`);
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

  const getPersonalTasksData = () => {
    const studentTasks: Record<string, string[]> = {};
    
    // Group assignments by student
    Object.entries(assignments).forEach(([key, studentId]) => {
        const [taskId, groupIdxStr] = key.split('::');
        const groupIdx = parseInt(groupIdxStr);
        const task = ALL_TASKS.find(t => t.id === taskId);
        
        if (!studentId || !task) return;

        if (!studentTasks[studentId]) studentTasks[studentId] = [];
        
        // Format Task Name
        let catName = task.category;
        if (catName === TaskCategory.EYE_EXERCISE) catName = '眼操';
        // Remove '点位' from name if present to match user preference "室外1" vs "室外点位1"
        // Also normalize parentheses to full-width
        const cleanName = task.name.replace('点位', '').replace(/\(/g, '（').replace(/\)/g, '）');
        
        const taskName = `${catName}${task.subCategory}${cleanName}`;
        
        // Append group info only if multiple groups exist
        const groupSuffix = groupCount > 1 ? `(第${groupIdx + 1}组)` : '';
        studentTasks[studentId].push(`${taskName}${groupSuffix}`);
    });

    // Sort students
    const sortedStudents = [...students].sort((a, b) => {
        if (a.grade !== b.grade) return a.grade - b.grade;
        if (a.classNum !== b.classNum) return a.classNum - b.classNum;
        return a.id.localeCompare(b.id);
    });
    
    return { studentTasks, sortedStudents };
  };

  const exportPersonalTasks = () => {
    const { studentTasks, sortedStudents } = getPersonalTasksData();

    let content = '个人任务清单：\n';
    let currentClass = '';

    sortedStudents.forEach(student => {
        const tasks = studentTasks[student.id];
        if (!tasks || tasks.length === 0) return;

        const className = formatClassName(student.grade, student.classNum);
        
        if (className !== currentClass) {
            content += `\n${className}\n`;
            currentClass = className;
        }

        // Sort tasks to ensure consistent order
        tasks.sort();
        
        content += `${student.name}： ${tasks.join('；')}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, '个人任务清单.txt');
  };

  const performExportExcel = () => {
    // 1. Summary Sheet Data
    const summaryRows: any[] = [];
    // Header Row
    const headerRow = ['项目', '细项', '检查内容'];
    for(let i=0; i<groupCount; i++) headerRow.push(`第${i+1}组`);
    summaryRows.push(headerRow);

    // To handle merging, we need to process tasks in order and track spans
    // Group tasks exactly as in ScheduleGrid to ensure consistent order
    const tasksByCategory = {
      [TaskCategory.CLEANING]: ALL_TASKS.filter(t => t.category === TaskCategory.CLEANING),
      [TaskCategory.INTERVAL_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.INTERVAL_EXERCISE),
      [TaskCategory.EYE_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.EYE_EXERCISE),
      [TaskCategory.EVENING_STUDY]: ALL_TASKS.filter(t => t.category === TaskCategory.EVENING_STUDY),
    };

    const merges: any[] = [];
    let currentRow = 1; // Start after header

    Object.entries(tasksByCategory).forEach(([category, tasks]) => {
        if (tasks.length === 0) return;

        const catStartRow = currentRow;
        
        // Group by SubCategory within Category
        const tasksBySub: Record<string, typeof tasks> = {};
        tasks.forEach(t => {
            if (!tasksBySub[t.subCategory]) tasksBySub[t.subCategory] = [];
            tasksBySub[t.subCategory].push(t);
        });

        Object.entries(tasksBySub).forEach(([subCat, subTasks]) => {
            const subStartRow = currentRow;

            subTasks.forEach(task => {
                const row: any[] = [
                    task.category,
                    task.subCategory,
                    task.name,
                ];
                
                // Loop through current group count
                for (let g = 0; g < groupCount; g++) {
                    const sid = assignments[`${task.id}::${g}`];
                    const student = students.find(s => s.id === sid);
                    row.push(student ? `${student.name} (${formatClassName(student.grade, student.classNum)})` : '');
                }
                summaryRows.push(row);
                currentRow++;
            });

            // Merge SubCategory Column (Col Index 1)
            if (subTasks.length > 1) {
                merges.push({
                    s: { r: subStartRow, c: 1 },
                    e: { r: currentRow - 1, c: 1 }
                });
            }
        });

        // Merge Category Column (Col Index 0)
        if (tasks.length > 1) {
            merges.push({
                s: { r: catStartRow, c: 0 },
                e: { r: currentRow - 1, c: 0 }
            });
        }
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);

    // Apply merges
    ws1['!merges'] = merges;

    // Style Summary Sheet
    // Set column widths
    const wscols = [
        { wch: 12 }, // Category
        { wch: 10 }, // Sub
        { wch: 15 }, // Name
    ];
    for(let i=0; i<groupCount; i++) wscols.push({ wch: 20 });
    ws1['!cols'] = wscols;

    // Apply styles to all cells in range
    const range = XLSX.utils.decode_range(ws1['!ref'] || 'A1:A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws1[cell_address]) continue;
        
        // Basic border
        ws1[cell_address].s = {
            border: {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } }
            },
            alignment: {
                vertical: "center",
                horizontal: "center",
                wrapText: true
            }
        };

        // Header style
        if (R === 0) {
            ws1[cell_address].s.fill = { fgColor: { rgb: "EFEFEF" } };
            ws1[cell_address].s.font = { bold: true };
        }
      }
    }
    
    XLSX.utils.book_append_sheet(wb, ws1, "总表");

    // 2. Person Details Sheet (Grouped by Grade -> Class -> Name)
    // Collect all assignments
    const studentTasks: Record<string, string[]> = {};
    
    Object.keys(assignments).forEach(key => {
        const [tid, gStr] = key.split('::');
        const g = parseInt(gStr);
        if(g >= groupCount) return;

        const sid = assignments[key];
        const student = students.find(s => s.id === sid);
        const task = ALL_TASKS.find(t => t.id === tid);
        
        if(student && task) {
            if (!studentTasks[sid]) studentTasks[sid] = [];
            // Format: Task Name
            // Use user requested format for task details if possible or just clean description
            studentTasks[sid].push(`${task.category} ${task.subCategory} ${task.name}`);
        }
    });

    // Convert to list and sort
    const detailsList: { grade: number, classNum: number, str: string }[] = [];
    Object.keys(studentTasks).forEach(sid => {
        const student = students.find(s => s.id === sid);
        if (student) {
            const tasksStr = studentTasks[sid].join('、'); // Use Chinese comma
            const gradeMap = ['', '高一', '高二', '高三'];
            // Format: 高二 - 二（1）班 - 张三：室外包干区迟到1号
            const gradeStr = gradeMap[student.grade] || `${student.grade}`;
            const customClassStr = `${gradeMap[student.grade]}（${student.classNum}）班`;
            
            const fullStr = `${gradeStr} - ${customClassStr} - ${student.name}：${tasksStr}`;
            
            detailsList.push({
                grade: student.grade,
                classNum: student.classNum,
                str: fullStr
            });
        }
    });

    detailsList.sort((a, b) => {
        if (a.grade !== b.grade) return a.grade - b.grade;
        return a.classNum - b.classNum;
    });

    // Create sheet with single column
    const ws2Data = detailsList.map(item => [item.str]);
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    ws2['!cols'] = [{ wch: 100 }]; // Wide column
    XLSX.utils.book_append_sheet(wb, ws2, "人员明细");

    // 3. Personal Task List Sheet (Optional)
    if (includePersonalList) {
        const { studentTasks, sortedStudents } = getPersonalTasksData();
        const sheetRows: any[][] = [['个人任务清单']];
        let currentClass = '';
        
        sortedStudents.forEach(student => {
            const tasks = studentTasks[student.id];
            if (!tasks || tasks.length === 0) return;
            
            const className = formatClassName(student.grade, student.classNum);
            if (className !== currentClass) {
                sheetRows.push(['']); // Empty row
                sheetRows.push([className]);
                currentClass = className;
            }
            tasks.sort();
            sheetRows.push([`${student.name}： ${tasks.join('；')}`]);
        });
        
        const ws3 = XLSX.utils.aoa_to_sheet(sheetRows);
        ws3['!cols'] = [{ wch: 80 }];
        XLSX.utils.book_append_sheet(wb, ws3, "个人任务清单");
    }

    XLSX.writeFile(wb, "检查安排表.xlsx");
    setExportDialog({ isOpen: false, type: null });
  };

  const performExportImage = async () => {
    const element = document.getElementById('schedule-export-area');
    if (element) {
      const canvas = await html2canvas(element, { 
        scale: 2,
        onclone: (clonedDoc) => {
            // 1. Hide the description text
            const desc = clonedDoc.getElementById('schedule-description');
            if (desc) desc.style.display = 'none';

            // 2. Add Personal List & Footer
            const container = clonedDoc.getElementById('schedule-export-area');
            if (container) {
                // Optional: Personal List
                if (includePersonalList) {
                    const listContainer = clonedDoc.createElement('div');
                    listContainer.style.marginTop = '20px';
                    listContainer.style.paddingTop = '20px';
                    listContainer.style.borderTop = '2px dashed #ccc';
                    listContainer.style.textAlign = 'left';
                    listContainer.style.color = '#000';
                    
                    const title = clonedDoc.createElement('h2');
                    title.innerText = '个人任务清单';
                    title.style.fontSize = '18px';
                    title.style.fontWeight = 'bold';
                    title.style.marginBottom = '15px';
                    listContainer.appendChild(title);
                    
                    const { studentTasks, sortedStudents } = getPersonalTasksData();
                    let currentClass = '';
                    
                    sortedStudents.forEach(student => {
                        const tasks = studentTasks[student.id];
                        if (!tasks || tasks.length === 0) return;

                        const className = formatClassName(student.grade, student.classNum);
                        if (className !== currentClass) {
                             const classHeader = clonedDoc.createElement('div');
                             classHeader.innerText = className;
                             classHeader.style.fontWeight = 'bold';
                             classHeader.style.marginTop = '12px';
                             classHeader.style.marginBottom = '4px';
                             classHeader.style.fontSize = '15px';
                             listContainer.appendChild(classHeader);
                             currentClass = className;
                        }
                        
                        const row = clonedDoc.createElement('div');
                        tasks.sort();
                        row.innerText = `${student.name}： ${tasks.join('；')}`;
                        row.style.fontSize = '14px';
                        row.style.lineHeight = '1.6';
                        listContainer.appendChild(row);
                    });
                    
                    container.appendChild(listContainer);
                }

                // Footer
                const footer = clonedDoc.createElement('div');
                footer.style.marginTop = '20px';
                footer.style.paddingTop = '10px';
                footer.style.borderTop = '1px solid #eee';
                footer.style.textAlign = 'center';
                footer.style.color = '#9ca3af';
                footer.style.fontSize = '12px';
                footer.innerText = 'Powered By LaoShui @ 2025 | 舟山市六横中学';
                container.appendChild(footer);
            }
        }
      });
      canvas.toBlob(blob => {
        if(blob) saveAs(blob, "检查安排表.png");
      });
      setExportDialog({ isOpen: false, type: null });
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
            <div className="bg-primary flex items-center justify-center rounded-lg overflow-hidden shadow-md">
                <img src="/images/zslhzxLOGO.png" alt="Logo" className="h-10 w-auto object-contain p-1" />
            </div>
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
             <button onClick={exportPersonalTasks} className="p-2 hover:bg-white rounded text-gray-600 hover:text-blue-600 transition" title="导出个人任务清单">
                <FileText size={18} />
             </button>
             <button onClick={() => setExportDialog({ isOpen: true, type: 'excel' })} className="p-2 hover:bg-white rounded text-gray-600 hover:text-green-600 transition" title="导出Excel">
                <FileSpreadsheet size={18} />
             </button>
             <button onClick={() => setExportDialog({ isOpen: true, type: 'image' })} className="p-2 hover:bg-white rounded text-gray-600 hover:text-purple-600 transition" title="导出图片">
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

      <footer className="bg-white border-t py-2 px-6 text-center text-xs text-gray-400 shrink-0">
        Powered By LaoShui @ 2025 | 舟山市六横中学
      </footer>

      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {exportDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-80">
                <h3 className="text-lg font-bold mb-4 text-gray-800">导出设置</h3>
                
                <div className="flex items-center gap-3 mb-6">
                    <input 
                        type="checkbox" 
                        id="includePersonal"
                        checked={includePersonalList}
                        onChange={(e) => setIncludePersonalList(e.target.checked)}
                        className="w-5 h-5 text-primary rounded focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="includePersonal" className="text-gray-700 cursor-pointer select-none">
                        附带个人任务清单
                    </label>
                </div>

                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setExportDialog({ isOpen: false, type: null })}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm transition"
                    >
                        取消
                    </button>
                    <button 
                        onClick={() => {
                            if(exportDialog.type === 'excel') performExportExcel();
                            else if(exportDialog.type === 'image') performExportImage();
                        }}
                        className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded text-sm transition shadow-sm"
                    >
                        确认导出
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
