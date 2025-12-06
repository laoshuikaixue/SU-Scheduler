import React, {useEffect, useRef, useState} from 'react';
import StudentList from './components/StudentList';
import ScheduleGrid from './components/ScheduleGrid';
import Toast from './components/Toast';
import {ALL_TASKS, MOCK_STUDENTS} from './constants';
import {Department, Student, TaskCategory} from './types';
import {autoScheduleMultiGroup, ConflictInfo, getScheduleConflicts, getSuggestions} from './services/scheduler';
import {formatClassName} from './utils';
import {
    Download,
    FileJson,
    FileSpreadsheet,
    FileText,
    Image as ImageIcon,
    Redo2,
    Sparkles,
    Trash2,
    Undo2,
    Upload,
    Users,
    Wand2
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import saveAs from 'file-saver';
// @ts-ignore
import {pinyin} from 'pinyin-pro';
import Modal from './components/Modal';
import {SuggestionsPanel} from './components/SuggestionsPanel';

const App: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    // Assignments key is `${taskId}::${groupIndex}`
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    // History for Undo/Redo
    const [history, setHistory] = useState<Record<string, string>[]>([{}]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [groupCount, setGroupCount] = useState(3);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    const conflicts = getScheduleConflicts(students, assignments, groupCount);
    const suggestions = getSuggestions(students, conflicts, assignments);

    // Export Dialog State
    const [exportDialog, setExportDialog] = useState<{
        isOpen: boolean,
        type: 'excel' | 'image' | null
    }>({isOpen: false, type: null});
    const [includePersonalList, setIncludePersonalList] = useState(false);
    const [imageScale, setImageScale] = useState(2);
    const [targetWidth, setTargetWidth] = useState<'auto' | 'a4' | 'a4_landscape'>('auto');
    const [clearDialog, setClearDialog] = useState<{ isOpen: boolean, clearStudents: boolean }>({
        isOpen: false,
        clearStudents: false
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({message, type});
    };

    // Helper to push new state to history
    const pushHistory = (newAssignments: Record<string, string>) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAssignments);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setAssignments(newAssignments);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setAssignments(history[newIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setAssignments(history[newIndex]);
        }
    };

    const handleJSONImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const content = evt.target?.result as string;
                const data = JSON.parse(content);

                if (data.students && Array.isArray(data.students)) {
                    setStudents(data.students);
                }
                if (data.assignments) {
                    // Importing assignments resets history or adds to it?
                    // Let's treat import as a new action
                    pushHistory(data.assignments);
                }
                if (data.groupCount) {
                    setGroupCount(data.groupCount);
                }

                showToast('数据导入成功！');
            } catch (err) {
                showToast('导入失败：文件格式错误', 'error');
                console.error(err);
            }
            // Reset input
            if (jsonInputRef.current) jsonInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const performClear = () => {
        pushHistory({});
        if (clearDialog.clearStudents) {
            setStudents([]);
        }
        setClearDialog({isOpen: false, clearStudents: false});
        showToast('数据已清空');
    };

    // Init mock data with pinyin
    useEffect(() => {
        const enriched = MOCK_STUDENTS.map(s => ({
            ...s,
            pinyinInitials: pinyin(s.name, {pattern: 'first', toneType: 'none', type: 'array'}).join('')
        }));
        setStudents(enriched);
    }, []);

    const handleAssign = (taskId: string, groupId: number, studentId: string | null) => {
        const key = `${taskId}::${groupId}`;
        const next = {...assignments};
        if (studentId === null) {
            delete next[key];
        } else {
            next[key] = studentId;
        }
        pushHistory(next);
    };

    const handleSwap = (taskId1: string, groupId1: number, taskId2: string, groupId2: number) => {
        const key1 = `${taskId1}::${groupId1}`;
        const key2 = `${taskId2}::${groupId2}`;

        const next = {...assignments};
        const val1 = next[key1];
        const val2 = next[key2];

        if (val2 === undefined) {
            delete next[key1];
        } else {
            next[key1] = val2;
        }

        if (val1 === undefined) {
            delete next[key2];
        } else {
            next[key2] = val1;
        }

        pushHistory(next);
    };

    const handleAutoSchedule = () => {
        // Schedule N groups - Pass empty object to force fresh calculation
        const newSchedule = autoScheduleMultiGroup(students, {}, groupCount);
        pushHistory(newSchedule);
        showToast(`${groupCount}组自动编排完成！`);
    };

    const handleAutoComplete = () => {
        // Pass current assignments to fill empty slots
        const newSchedule = autoScheduleMultiGroup(students, assignments, groupCount);
        pushHistory(newSchedule);
        showToast(`${groupCount}组自动补全完成！`);
    };

    const handleApplySuggestion = (conflict: ConflictInfo, suggestedStudentId: string) => {
        // handleAssign calls pushHistory, so we can reuse it
        handleAssign(conflict.taskId, conflict.groupId, suggestedStudentId);
        showToast('已应用建议修改');
    };

    const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, {type: 'binary'});
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
                    if (classStr.includes('高一') || classStr.includes('一')) grade = 1;
                    if (classStr.includes('高二') || classStr.includes('二')) grade = 2;
                    if (classStr.includes('高三') || classStr.includes('三')) grade = 3;
                    const match = classStr.match(/\d+/);
                    if (match) classNum = parseInt(match[0]);
                }

                const name = row['姓名'] || `Student ${idx}`;
                // Auto generate pinyin
                const py = pinyin(name, {pattern: 'first', toneType: 'none', type: 'array'}).join('');

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
            pushHistory({});
            showToast(`成功导入 ${newStudents.length} 人`);
        };
        reader.readAsBinaryString(file);
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([
            {姓名: '张三', 部门: '纪检部', 班级: '2-1'},
            {姓名: '李四', 部门: '主席团', 班级: '3-5'}
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

            // Avoid duplication like "晚自习晚自习"
            const sub = task.subCategory === task.category ? '' : task.subCategory;

            const taskName = `${catName}${sub}${cleanName}`;

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

        return {studentTasks, sortedStudents};
    };

    const exportPersonalTasks = () => {
        const {studentTasks, sortedStudents} = getPersonalTasksData();

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

        const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
        saveAs(blob, '个人任务清单.txt');
    };

    const performExportExcel = () => {
        // 1. Summary Sheet Data
        const summaryRows: any[] = [];
        // Header Row
        const headerRow = ['项目', '细项', '检查内容'];
        for (let i = 0; i < groupCount; i++) headerRow.push(`第${i + 1}组`);
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
                        s: {r: subStartRow, c: 1},
                        e: {r: currentRow - 1, c: 1}
                    });
                }

                // 新增: 课间操相邻楼层如果是同一个人，合并单元格
                if (category === TaskCategory.INTERVAL_EXERCISE && subCat === '室内') {
                    // subTasks 是所有室内课间操任务，按楼层排序
                    // 遍历每一组
                    for (let g = 0; g < groupCount; g++) {
                        const colIndex = 3 + g; // 0,1,2 是固定列，3开始是组
                        let startRow = subStartRow;

                        for (let i = 0; i < subTasks.length; i++) {
                            const currentTask = subTasks[i];
                            const currentSid = assignments[`${currentTask.id}::${g}`];

                            // 检查下一行是否相同
                            let span = 1;
                            while (i + span < subTasks.length) {
                                const nextTask = subTasks[i + span];
                                const nextSid = assignments[`${nextTask.id}::${g}`];
                                if (currentSid && nextSid && currentSid === nextSid) {
                                    span++;
                                } else {
                                    break;
                                }
                            }

                            if (span > 1) {
                                merges.push({
                                    s: {r: startRow + i, c: colIndex},
                                    e: {r: startRow + i + span - 1, c: colIndex}
                                });
                                // 跳过已处理的行
                                i += span - 1;
                            }
                        }
                    }
                }
            });

            // Merge Category Column (Col Index 0)
            if (tasks.length > 1) {
                merges.push({
                    s: {r: catStartRow, c: 0},
                    e: {r: currentRow - 1, c: 0}
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
            {wch: 12}, // Category
            {wch: 10}, // Sub
            {wch: 15}, // Name
        ];
        for (let i = 0; i < groupCount; i++) wscols.push({wch: 20});
        ws1['!cols'] = wscols;

        // Apply styles to all cells in range
        const range = XLSX.utils.decode_range(ws1['!ref'] || 'A1:A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = XLSX.utils.encode_cell({r: R, c: C});
                if (!ws1[cell_address]) continue;

                // Basic border
                ws1[cell_address].s = {
                    border: {
                        top: {style: "thin", color: {rgb: "000000"}},
                        bottom: {style: "thin", color: {rgb: "000000"}},
                        left: {style: "thin", color: {rgb: "000000"}},
                        right: {style: "thin", color: {rgb: "000000"}}
                    },
                    alignment: {
                        vertical: "center",
                        horizontal: "center",
                        wrapText: true
                    }
                };

                // Header style
                if (R === 0) {
                    ws1[cell_address].s.fill = {fgColor: {rgb: "EFEFEF"}};
                    ws1[cell_address].s.font = {bold: true};
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
            if (g >= groupCount) return;

            const sid = assignments[key];
            const student = students.find(s => s.id === sid);
            const task = ALL_TASKS.find(t => t.id === tid);

            if (student && task) {
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
        ws2['!cols'] = [{wch: 100}]; // Wide column
        XLSX.utils.book_append_sheet(wb, ws2, "人员明细");

        // 3. Personal Task List Sheet (Optional)
        if (includePersonalList) {
            const {studentTasks, sortedStudents} = getPersonalTasksData();
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
            ws3['!cols'] = [{wch: 80}];
            XLSX.utils.book_append_sheet(wb, ws3, "个人任务清单");
        }

        XLSX.writeFile(wb, "检查安排表.xlsx");
        setExportDialog({isOpen: false, type: null});
    };

    const performExportImage = async () => {
        const element = document.getElementById('schedule-export-area');
        if (element) {
            const canvas = await html2canvas(element, {
                scale: imageScale,
                onclone: (clonedDoc) => {
                    // 1. Hide the description text
                    const desc = clonedDoc.getElementById('schedule-description');
                    if (desc) desc.style.display = 'none';

                    // 2. Add Personal List & Footer
                    const container = clonedDoc.getElementById('schedule-export-area');
                    if (container) {
                        // Apply Width Settings
                        if (targetWidth === 'a4' || targetWidth === 'a4_landscape') {
                            const width = targetWidth === 'a4' ? '794px' : '1123px';
                            container.style.width = width;
                            container.style.minWidth = 'unset';
                            // Find table and adjust
                            const table = container.querySelector('table');
                            if (table) {
                                table.style.minWidth = '100%';
                                table.style.width = '100%';
                            }
                        }

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

                            const {studentTasks, sortedStudents} = getPersonalTasksData();
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
                        footer.innerText = 'Powered By LaoShui @ 2025 | 学生会检查编排系统 | 舟山市六横中学';
                        container.appendChild(footer);
                    }
                }
            });
            canvas.toBlob(blob => {
                if (blob) saveAs(blob, "检查安排表.png");
            });
            setExportDialog({isOpen: false, type: null});
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
                        <img src="/images/zslhzxLOGO.png" alt="Logo" className="h-10 w-auto object-contain p-1"/>
                    </div>
                    <h1 className="font-bold text-xl text-gray-800">学生会检查编排系统</h1>
                </div>

                <div className="flex items-center gap-3">
                    {/* Undo/Redo Controls */}
                    <div className="flex items-center gap-1 mr-2 border-r pr-2 border-gray-300">
                        <button onClick={handleUndo} disabled={historyIndex <= 0}
                                className="p-2 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 transition"
                                title="撤销">
                            <Undo2 size={18}/>
                        </button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}
                                className="p-2 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 transition"
                                title="重做">
                            <Redo2 size={18}/>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 mr-4 bg-gray-50 px-2 py-1 rounded border">
                        <Users size={16} className="text-gray-500"/>
                        <span className="text-sm text-gray-600">组数:</span>
                        <select
                            value={groupCount}
                            onChange={(e) => setGroupCount(Number(e.target.value))}
                            className="bg-transparent text-sm font-medium outline-none cursor-pointer"
                        >
                            {[1, 2, 3, 4, 5, 6].map(n => (
                                <option key={n} value={n}>{n} 组</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition"
                    >
                        <FileSpreadsheet size={16}/> 下载模板
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
                        <Upload size={16}/> 导入人员
                    </button>

                    <input
                        type="file"
                        ref={jsonInputRef}
                        className="hidden"
                        accept=".json"
                        onChange={handleJSONImport}
                    />
                    <button
                        onClick={() => jsonInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition"
                    >
                        <FileJson size={16}/> 导入数据
                    </button>

                    <button
                        onClick={handleAutoSchedule}
                        className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-blue-600 text-white rounded-md text-sm transition shadow-sm"
                    >
                        <Wand2 size={16}/> 智能编排
                    </button>

                    <button
                        onClick={handleAutoComplete}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm transition shadow-sm"
                    >
                        <Sparkles size={16}/> 自动补全
                    </button>

                    <div className="h-6 w-px bg-gray-300 mx-2"></div>

                    <div className="flex bg-gray-100 rounded-md p-1">
                        <button onClick={exportPersonalTasks}
                                className="p-2 hover:bg-white rounded text-gray-600 hover:text-blue-600 transition"
                                title="导出个人任务清单">
                            <FileText size={18}/>
                        </button>
                        <button onClick={() => setExportDialog({isOpen: true, type: 'excel'})}
                                className="p-2 hover:bg-white rounded text-gray-600 hover:text-green-600 transition"
                                title="导出Excel">
                            <FileSpreadsheet size={18}/>
                        </button>
                        <button onClick={() => setExportDialog({isOpen: true, type: 'image'})}
                                className="p-2 hover:bg-white rounded text-gray-600 hover:text-purple-600 transition"
                                title="导出图片">
                            <ImageIcon size={18}/>
                        </button>
                        <button onClick={exportJSON}
                                className="p-2 hover:bg-white rounded text-gray-600 hover:text-orange-600 transition"
                                title="导出数据">
                            <Download size={18}/>
                        </button>
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={() => setClearDialog({isOpen: true, clearStudents: false})}
                                className="p-2 hover:bg-white rounded text-gray-600 hover:text-red-600 transition"
                                title="清空所有">
                            <Trash2 size={18}/>
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <StudentList students={students}/>

                <main className="flex-1 overflow-auto bg-gray-100 p-6 flex justify-center">
                    <div className="w-full max-w-[1400px] bg-white shadow-lg rounded-xl h-fit min-h-[500px]">
                        <ScheduleGrid
                            students={students}
                            assignments={assignments}
                            onAssign={handleAssign}
                            onSwap={handleSwap}
                            groupCount={groupCount}
                            conflicts={conflicts}
                        />
                    </div>
                </main>

                <SuggestionsPanel suggestions={suggestions} students={students}
                                  onApplySuggestion={handleApplySuggestion}/>
            </div>

            <footer className="bg-white border-t py-2 px-6 text-center text-xs text-gray-400 shrink-0">
                Powered By LaoShui @ 2025 | 学生会检查编排系统 | 舟山市六横中学
            </footer>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            <Modal
                isOpen={exportDialog.isOpen}
                onClose={() => setExportDialog({isOpen: false, type: null})}
                title="导出设置"
                footer={
                    <>
                        <button
                            onClick={() => setExportDialog({isOpen: false, type: null})}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm transition"
                        >
                            取消
                        </button>
                        <button
                            onClick={() => {
                                if (exportDialog.type === 'excel') performExportExcel();
                                else if (exportDialog.type === 'image') performExportImage();
                            }}
                            className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded text-sm transition shadow-sm"
                        >
                            确认导出
                        </button>
                    </>
                }
            >
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

                {exportDialog.type === 'image' && (
                    <div className="mb-2">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">页面宽度设置</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setTargetWidth('auto')}
                                    className={`flex-1 py-1.5 text-sm border rounded transition ${
                                        targetWidth === 'auto'
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    自动
                                </button>
                                <button
                                    onClick={() => setTargetWidth('a4')}
                                    className={`flex-1 py-1.5 text-sm border rounded transition ${
                                        targetWidth === 'a4'
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    A4 竖向
                                </button>
                                <button
                                    onClick={() => setTargetWidth('a4_landscape')}
                                    className={`flex-1 py-1.5 text-sm border rounded transition ${
                                        targetWidth === 'a4_landscape'
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    A4 横向
                                </button>
                            </div>
                        </div>

                        <label className="block text-sm font-medium text-gray-700 mb-2">图片清晰度</label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map(scale => (
                                <button
                                    key={scale}
                                    onClick={() => setImageScale(scale)}
                                    className={`flex-1 py-1.5 text-sm border rounded transition ${
                                        imageScale === scale
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    {scale}x
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={clearDialog.isOpen}
                onClose={() => setClearDialog({isOpen: false, clearStudents: false})}
                title="清空数据"
                footer={
                    <>
                        <button
                            onClick={() => setClearDialog({isOpen: false, clearStudents: false})}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm transition"
                        >
                            取消
                        </button>
                        <button
                            onClick={performClear}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition shadow-sm"
                        >
                            确认清空
                        </button>
                    </>
                }
            >
                <div className="text-gray-600 mb-4">
                    确定要清空当前的排期安排吗？此操作不可撤销。
                </div>
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                    <input
                        type="checkbox"
                        id="clearStudents"
                        checked={clearDialog.clearStudents}
                        onChange={(e) => setClearDialog(prev => ({...prev, clearStudents: e.target.checked}))}
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500 cursor-pointer"
                    />
                    <label htmlFor="clearStudents"
                           className="text-gray-700 cursor-pointer select-none text-sm font-medium">
                        同时清空人员名单
                    </label>
                </div>
            </Modal>
        </div>
    );
};

export default App;
