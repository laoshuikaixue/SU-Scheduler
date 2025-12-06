import React, {useEffect, useRef, useState} from 'react';
import StudentList from './components/StudentList';
import ScheduleGrid from './components/ScheduleGrid';
import Toast from './components/Toast';
import {ALL_TASKS, MOCK_STUDENTS} from './constants';
import {Department, Student, TaskCategory} from './types';
import {
    autoScheduleMultiGroupAsync,
    CalculationStats,
    ConflictInfo,
    getScheduleConflicts,
    getSuggestions
} from './services/scheduler';
import {formatClassName} from './utils';
import CalculationLog from './components/CalculationLog';
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
    Wand2,
    ArrowLeftRight
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import saveAs from 'file-saver';
// @ts-ignore
import {pinyin} from 'pinyin-pro';
import Modal from './components/Modal';
import {SuggestionsPanel} from './components/SuggestionsPanel';
import SwapModal from './components/SwapModal';
import { SwapProposal } from './services/swapService';

const App: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    // 任务分配 key 格式为 `${taskId}::${groupIndex}`
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    // 撤销/重做历史记录
    const [history, setHistory] = useState<Record<string, string>[]>([{}]);
    const [historyIndex, setHistoryIndex] = useState(0);

    // 使用 Ref 保持最新的 undo 函数引用，解决 Toast 中闭包过时的问题
    const handleUndoRef = useRef<() => void>(() => {});

    const [groupCount, setGroupCount] = useState(3);
    const [isGroupSelectOpen, setIsGroupSelectOpen] = useState(false); // 控制下拉菜单展开
    const groupSelectRef = useRef<HTMLDivElement>(null); // 用于点击外部关闭

    const [toast, setToast] = useState<{
        message: string,
        type: 'success' | 'error',
        action?: { label: string, onClick: () => void }
    } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [stats, setStats] = useState<CalculationStats | undefined>(undefined);
    const [isCalculating, setIsCalculating] = useState(false);
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

    const conflicts = getScheduleConflicts(students, assignments, groupCount);
    const suggestions = getSuggestions(students, conflicts, assignments);

    // 导出对话框状态
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

    const showToast = (
        message: string,
        type: 'success' | 'error' = 'success',
        action?: { label: string, onClick: () => void }
    ) => {
        setToast({message, type, action});
    };

    // 辅助函数：将新状态推入历史记录
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

    // 更新 Ref
    useEffect(() => {
        handleUndoRef.current = handleUndo;
    }, [handleUndo]);

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
                    // 导入分配是重置历史还是添加到历史？
                    // 我们将导入视为一个新的操作
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
            // 重置输入
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

    // 初始化带拼音的模拟数据
    useEffect(() => {
        const enriched = MOCK_STUDENTS.map(s => ({
            ...s,
            pinyinInitials: pinyin(s.name, {pattern: 'first', toneType: 'none', type: 'array'}).join('')
        }));
        setStudents(enriched);
    }, []);

    // 点击外部关闭下拉菜单
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (groupSelectRef.current && !groupSelectRef.current.contains(event.target as Node)) {
                setIsGroupSelectOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
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
        showToast('交换成功', 'success', {
            label: '撤销',
            onClick: () => handleUndoRef.current()
        });
    };

    const handleSmartSwap = (
        proposal: SwapProposal,
        studentId: string,
        originalTaskId: string | null,
        originalGroupId: number | null
    ) => {
        const next = { ...assignments };
        const targetKey = `${proposal.targetTaskId}::${proposal.targetGroupId}`;

        // 1. Remove student from original slot (if any)
        if (originalTaskId && originalGroupId !== null) {
            const originalKey = `${originalTaskId}::${originalGroupId}`;
            // Double check it's still them (should be)
            if (next[originalKey] === studentId) {
                delete next[originalKey];
            }
        }

        // 2. Handle the target slot
        if (proposal.type === 'MOVE_TO_EMPTY') {
            // Simply assign student to target
            next[targetKey] = studentId;
        } else if (proposal.type === 'DIRECT_SWAP') {
            const targetStudentId = proposal.targetStudentId;
            // Assign student to target
            next[targetKey] = studentId;
            
            // Assign targetStudent to original slot (if exists)
            if (targetStudentId && originalTaskId && originalGroupId !== null) {
                const originalKey = `${originalTaskId}::${originalGroupId}`;
                next[originalKey] = targetStudentId;
            }
        }

        pushHistory(next);
        showToast('调换成功', 'success', {
            label: '撤销',
            onClick: () => handleUndoRef.current()
        });
    };

    const handleAutoSchedule = async () => {
        setIsCalculating(true);
        setLogs(['>>> 初始化计算引擎...', '>>> 加载学生数据...', '>>> 加载任务约束...']);
        setStats(undefined);

        try {
            // 编排 N 组 - 传入空对象以强制重新计算
            const newSchedule = await autoScheduleMultiGroupAsync(
                students,
                {},
                groupCount,
                (log, newStats) => {
                    setLogs(prev => [...prev, log]);
                    if (newStats) setStats(newStats);
                }
            );
            pushHistory(newSchedule);
            showToast(`${groupCount}组自动编排完成！`);
        } catch (error) {
            console.error(error);
            showToast('编排失败', 'error');
        } finally {
            setTimeout(() => setIsCalculating(false), 3000);
        }
    };

    const handleAutoComplete = async () => {
        setIsCalculating(true);
        setLogs(['>>> 初始化补全模式...', '>>> 锁定已有任务...', '>>> 扫描剩余空位...']);
        setStats(undefined);

        try {
            // 传入当前分配以填充空位
            const newSchedule = await autoScheduleMultiGroupAsync(
                students,
                assignments,
                groupCount,
                (log, newStats) => {
                    setLogs(prev => [...prev, log]);
                    if (newStats) setStats(newStats);
                }
            );
            pushHistory(newSchedule);
            showToast(`${groupCount}组自动补全完成！`);
        } catch (error) {
            console.error(error);
            showToast('补全失败', 'error');
        } finally {
            setTimeout(() => setIsCalculating(false), 3000);
        }
    };

    const handleApplySuggestion = (conflict: ConflictInfo, suggestedStudentId: string) => {
        // handleAssign 调用了 pushHistory，所以我们可以重用它
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
                    // 尝试解析中文如 "高二(1)"
                    if (classStr.includes('高一') || classStr.includes('一')) grade = 1;
                    if (classStr.includes('高二') || classStr.includes('二')) grade = 2;
                    if (classStr.includes('高三') || classStr.includes('三')) grade = 3;
                    const match = classStr.match(/\d+/);
                    if (match) classNum = parseInt(match[0]);
                }

                const name = row['姓名'] || `Student ${idx}`;
                // 自动生成拼音
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

        // 按学生分组分配
        Object.entries(assignments).forEach(([key, studentId]) => {
            const [taskId, groupIdxStr] = key.split('::');
            const groupIdx = parseInt(groupIdxStr);
            const task = ALL_TASKS.find(t => t.id === taskId);

            if (!studentId || !task) return;

            if (!studentTasks[studentId]) studentTasks[studentId] = [];

            // 格式化任务名称
            let catName = task.category;
            if (catName === TaskCategory.EYE_EXERCISE) catName = '眼操';
            // 如果名称中包含 '点位' 则移除，以符合用户偏好 "室外1" vs "室外点位1"
            // 同时将括号标准化为全角
            const cleanName = task.name.replace('点位', '').replace(/\(/g, '（').replace(/\)/g, '）');

            // 避免重复，例如 "晚自习晚自习"
            const sub = task.subCategory === task.category ? '' : task.subCategory;

            const taskName = `${catName}${sub}${cleanName}`;

            // 仅当存在多个组时附加组信息
            const groupSuffix = groupCount > 1 ? `(第${groupIdx + 1}组)` : '';
            studentTasks[studentId].push(`${taskName}${groupSuffix}`);
        });

        // 学生排序
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

            // 对任务进行排序以确保顺序一致
            tasks.sort();

            content += `${student.name}： ${tasks.join('；')}\n`;
        });

        const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
        saveAs(blob, '个人任务清单.txt');
    };

    const performExportExcel = () => {
        // 1. 汇总表数据
        const summaryRows: any[] = [];
        // 标题行
        const headerRow = ['项目', '细项', '检查内容'];
        for (let i = 0; i < groupCount; i++) headerRow.push(`第${i + 1}组`);
        summaryRows.push(headerRow);

        // 为了处理合并，我们需要按顺序处理任务并跟踪跨度
        // 严格按照 ScheduleGrid 中的分组对任务进行分组，以确保顺序一致
        const tasksByCategory = {
            [TaskCategory.CLEANING]: ALL_TASKS.filter(t => t.category === TaskCategory.CLEANING),
            [TaskCategory.INTERVAL_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.INTERVAL_EXERCISE),
            [TaskCategory.EYE_EXERCISE]: ALL_TASKS.filter(t => t.category === TaskCategory.EYE_EXERCISE),
            [TaskCategory.EVENING_STUDY]: ALL_TASKS.filter(t => t.category === TaskCategory.EVENING_STUDY),
        };

        const merges: any[] = [];
        let currentRow = 1; // 从标题后开始

        Object.entries(tasksByCategory).forEach(([category, tasks]) => {
            if (tasks.length === 0) return;

            const catStartRow = currentRow;

            // 在类别内按子类别分组
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

                    // 遍历当前组数
                    for (let g = 0; g < groupCount; g++) {
                        const sid = assignments[`${task.id}::${g}`];
                        const student = students.find(s => s.id === sid);
                        row.push(student ? `${student.name} (${formatClassName(student.grade, student.classNum)})` : '');
                    }
                    summaryRows.push(row);
                    currentRow++;
                });

                // 合并子类别列 (列索引 1)
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

            // 合并类别列 (列索引 0)
            if (tasks.length > 1) {
                merges.push({
                    s: {r: catStartRow, c: 0},
                    e: {r: currentRow - 1, c: 0}
                });
            }
        });

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);

        // 应用合并
        ws1['!merges'] = merges;

        // 样式化汇总表
        // 设置列宽
        const wscols = [
            {wch: 12}, // 类别
            {wch: 10}, // 子类别
            {wch: 15}, // 名称
        ];
        for (let i = 0; i < groupCount; i++) wscols.push({wch: 20});
        ws1['!cols'] = wscols;

        // 应用样式到范围内的所有单元格
        const range = XLSX.utils.decode_range(ws1['!ref'] || 'A1:A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = XLSX.utils.encode_cell({r: R, c: C});
                if (!ws1[cell_address]) continue;

                // 基础边框
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

                // 标题行样式
                if (R === 0) {
                    ws1[cell_address].s.fill = {fgColor: {rgb: "EFEFEF"}};
                    ws1[cell_address].s.font = {bold: true};
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws1, "总表");

        // 2. 人员明细表 (按 年级 -> 班级 -> 姓名 分组)
        // 收集所有分配
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
                // 格式: 任务名称
                // 如果可能，使用用户要求的格式，或者直接使用清晰的描述
                studentTasks[sid].push(`${task.category} ${task.subCategory} ${task.name}`);
            }
        });

        // 转换为列表并排序
        const detailsList: { grade: number, classNum: number, str: string }[] = [];
        Object.keys(studentTasks).forEach(sid => {
            const student = students.find(s => s.id === sid);
            if (student) {
                const tasksStr = studentTasks[sid].join('、'); // 使用中文顿号
                const gradeMap = ['', '高一', '高二', '高三'];
                // 格式: 高二 - 二（1）班 - 张三：室外包干区迟到1号
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

        // 创建单列的工作表
        const ws2Data = detailsList.map(item => [item.str]);
        const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
        ws2['!cols'] = [{wch: 100}]; // 宽列
        XLSX.utils.book_append_sheet(wb, ws2, "人员明细");

        // 3. 个人任务清单表 (可选)
        if (includePersonalList) {
            const {studentTasks, sortedStudents} = getPersonalTasksData();
            const sheetRows: any[][] = [['个人任务清单']];
            let currentClass = '';

            sortedStudents.forEach(student => {
                let tasks = studentTasks[student.id] || [];
                if (tasks.length === 0) return;

                // NEW: 合并显示 "高一 (1-3班)" 和 "高一 (4-6班)" -> "高一"
                const hasG1A = tasks.includes('高一 (1-3班)');
                const hasG1B = tasks.includes('高一 (4-6班)');
                
                if (hasG1A && hasG1B) {
                    tasks = tasks.filter(t => t !== '高一 (1-3班)' && t !== '高一 (4-6班)');
                    tasks.push('高一');
                }

                const className = formatClassName(student.grade, student.classNum);
                if (className !== currentClass) {
                    sheetRows.push(['']); // 空行
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
                    // 1. 隐藏描述文本
                    const desc = clonedDoc.getElementById('schedule-description');
                    if (desc) desc.style.display = 'none';

                    // 2. 添加个人清单和页脚
                    const container = clonedDoc.getElementById('schedule-export-area');
                    if (container) {
                        // 应用宽度设置
                        if (targetWidth === 'a4' || targetWidth === 'a4_landscape') {
                            const width = targetWidth === 'a4' ? '794px' : '1123px';
                            container.style.width = width;
                            container.style.minWidth = 'unset';
                            // 查找并调整表格
                            const table = container.querySelector('table');
                            if (table) {
                                table.style.minWidth = '100%';
                                table.style.width = '100%';
                            }
                        }

                        // 可选: 个人清单
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
                                let tasks = studentTasks[student.id] || [];
                                if (tasks.length === 0) return;

                                // NEW: 合并显示
                                const hasG1A = tasks.includes('高一 (1-3班)');
                                const hasG1B = tasks.includes('高一 (4-6班)');
                                
                                if (hasG1A && hasG1B) {
                                    tasks = tasks.filter(t => t !== '高一 (1-3班)' && t !== '高一 (4-6班)');
                                    tasks.push('高一');
                                }

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

                        // 页脚
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
                    {/* 撤销/重做 控件 */}
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

                    <div className="flex items-center gap-2 mr-4 bg-gray-50 px-3 py-1.5 rounded-full border shadow-sm hover:shadow transition-shadow relative" ref={groupSelectRef}>
                        <Users size={16} className="text-gray-500"/>
                        <span className="text-sm text-gray-600 font-medium">组数:</span>
                        <div
                            className="relative cursor-pointer flex items-center gap-1 min-w-[3rem] justify-between"
                            onClick={() => setIsGroupSelectOpen(!isGroupSelectOpen)}
                        >
                            <span className="text-sm font-bold text-primary">{groupCount}</span>
                            <svg
                                className={`h-4 w-4 fill-current text-gray-400 transition-transform duration-200 ${isGroupSelectOpen ? 'rotate-180' : ''}`}
                                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"
                            >
                                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
                            </svg>
                        </div>
                        
                        {isGroupSelectOpen && (
                            <div className="absolute top-full left-0 mt-2 w-full min-w-[100px] bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                {[1, 2, 3, 4, 5, 6].map(n => (
                                    <div
                                        key={n}
                                        onClick={() => {
                                            setGroupCount(n);
                                            setIsGroupSelectOpen(false);
                                        }}
                                        className={`px-4 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between
                                            ${groupCount === n ? 'bg-blue-50 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        <span>{n} 组</span>
                                        {groupCount === n && <div className="w-1.5 h-1.5 rounded-full bg-primary"/>}
                                    </div>
                                ))}
                            </div>
                        )}
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

                    <button
                        onClick={() => setIsSwapModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm transition shadow-sm"
                    >
                        <ArrowLeftRight size={16}/> 智能调换
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
                    <div className="w-full max-w-[1400px] flex flex-col">
                        <div className="w-full bg-white shadow-lg rounded-xl h-fit min-h-[500px]">
                            <ScheduleGrid
                                students={students}
                                assignments={assignments}
                                onAssign={handleAssign}
                                onSwap={handleSwap}
                                groupCount={groupCount}
                                conflicts={conflicts}
                            />
                        </div>
                    </div>
                </main>

                <div
                    className="flex flex-col w-80 shrink-0 bg-gradient-to-b from-white to-gray-50 border-l border-gray-200 shadow-lg h-full overflow-hidden">
                    <div className="p-4 bg-white border-b border-gray-200">
                        <CalculationLog logs={logs} stats={stats} isCalculating={isCalculating}/>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <SuggestionsPanel suggestions={suggestions} students={students}
                                          onApplySuggestion={handleApplySuggestion}/>
                    </div>
                </div>
            </div>

            <footer className="bg-white border-t py-2 px-6 text-center text-xs text-gray-400 shrink-0">
                Powered By LaoShui @ 2025 | 学生会检查编排系统 | 舟山市六横中学
            </footer>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                    action={toast.action}
                />
            )}

            <SwapModal
                isOpen={isSwapModalOpen}
                onClose={() => setIsSwapModalOpen(false)}
                students={students}
                scheduleState={{ students, assignments }}
                numGroups={groupCount}
                onApplySwap={handleSmartSwap}
                onGlobalReschedule={(newAssignments) => {
                    pushHistory(newAssignments);
                    showToast('智能调换成功', 'success', {
                        label: '撤销',
                        onClick: () => handleUndoRef.current()
                    });
                }}
            />

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
