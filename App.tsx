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
import RecruitmentAnalysisModal from './components/RecruitmentAnalysisModal';
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
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isTemporaryMode, setIsTemporaryMode] = useState(false);
    const [previewBackup, setPreviewBackup] = useState<{
        students: Student[],
        assignments: Record<string, string>,
        history: Record<string, string>[],
        historyIndex: number
    } | null>(null);

    const conflicts = getScheduleConflicts(students, assignments, groupCount, { enableTemporaryMode: isTemporaryMode });
    const suggestions = getSuggestions(students, conflicts, assignments, { enableTemporaryMode: isTemporaryMode });

    // 计算每个学生的任务数量
    const taskCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        Object.values(assignments).forEach(studentId => {
            if (studentId) {
                counts[studentId] = (counts[studentId] || 0) + 1;
            }
        });
        return counts;
    }, [assignments]);

    // 导出对话框状态
    const [exportDialog, setExportDialog] = useState<{
        isOpen: boolean,
        type: 'excel' | 'image' | null
    }>({isOpen: false, type: null});
    const [includePersonalList, setIncludePersonalList] = useState(false);
    const [imageScale, setImageScale] = useState(2);
    const [targetWidth, setTargetWidth] = useState<'auto' | 'a4' | 'a4_landscape'>('auto');
    const [isExportingImage, setIsExportingImage] = useState(false);
    const [exportRemarks, setExportRemarks] = useState('');
    const [exportTitle, setExportTitle] = useState('学生会检查安排表');
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

    const handleRecruitmentPreview = async (plan: { deptATarget: number, deptBTarget: number }) => {
        // 1. Backup current state
        setPreviewBackup({
            students,
            assignments,
            history,
            historyIndex
        });

        // 2. Prepare base students (remove Grade 3)
        const baseStudents = students.filter(s => s.grade !== 3);
        
        // 3. Calculate recruits needed
        // Dept A: Discipline, Study
        const deptAStudents = baseStudents.filter(s => [Department.DISCIPLINE, Department.STUDY].includes(s.department));
        // Dept B: Chairman, Art, Clubs, Sports
        const deptBStudents = baseStudents.filter(s => [Department.CHAIRMAN, Department.ART, Department.CLUBS, Department.SPORTS].includes(s.department));
        
        const recruitsA = Math.max(0, plan.deptATarget - deptAStudents.length);
        const recruitsB = Math.max(0, plan.deptBTarget - deptBStudents.length);
        
        // 4. Generate mock students
        const newStudents = [...baseStudents];
        
        // Helper to add students
        const addRecruits = (count: number, dept: Department, prefix: string) => {
            for (let i = 0; i < count; i++) {
                const id = `mock-${prefix}-${i + 1}`;
                newStudents.push({
                    id,
                    name: `拟招${prefix}${i + 1}`,
                    department: dept,
                    grade: 1, // Default to Grade 1 as requested
                    classNum: 1,
                    pinyinInitials: `NZ${prefix}${i+1}`,
                    isLeader: false
                });
            }
        };

        if (recruitsA > 0) addRecruits(recruitsA, Department.DISCIPLINE, '纪检');
        if (recruitsB > 0) addRecruits(recruitsB, Department.ART, '文宣'); // Default to Art for Dept B

        // 5. Update state
        setStudents(newStudents);
        setAssignments({});
        // Reset history for preview mode to avoid confusion
        const initialHistory = [{}]; 
        setHistory(initialHistory);
        setHistoryIndex(0);
        
        setIsAnalysisModalOpen(false);
        showToast(`已进入预览模式：新增 ${recruitsA + recruitsB} 名模拟新生`);

        // 6. Trigger auto schedule directly
        setIsCalculating(true);
        setLogs(['>>> 预览模式初始化...', '>>> 生成模拟数据...', '>>> 开始智能编排...']);
        setStats(undefined);
        
        try {
             const newSchedule = await autoScheduleMultiGroupAsync(
                newStudents, 
                {},
                groupCount,
                (log, newStats) => {
                    setLogs(prev => [...prev, log]);
                    if (newStats) setStats(newStats);
                },
                { enableTemporaryMode: isTemporaryMode }
            );
            
            // Update assignments and history
            
            // 7. Post-process: Rename mock students based on schedule order
            // Strategy: 
            // Iterate through each group (0 to groupCount-1).
            // For each group, list tasks in a predefined order (e.g., Cleaning -> Outdoor -> Eye AM -> Eye PM -> Evening).
            // Find the mock student assigned to each task.
            // Assign a new name like "拟招-纪检-G1-01" (Group 1, Student 1).
            
            // Task order definition
            const taskOrder = [
                'clean-out', 'clean-in-1', 'clean-in-2', 'clean-check-1', 'clean-check-2', // Cleaning
                'ex-out-1', 'ex-out-2', 'ex-out-3', // Outdoor
                'eye-am-g1-a', 'eye-am-g1-b', 'eye-am-g2-a', 'eye-am-g2-b', // Eye AM
                'eye-pm-g1-a', 'eye-pm-g1-b', 'eye-pm-g2-a', 'eye-pm-g2-b', 'eye-pm-g3-a', 'eye-pm-g3-b', // Eye PM
                'eve-g1', 'eve-g2', 'eve-g3' // Evening
            ];

            const renamedStudents = [...newStudents];
            const renamedAssignments = {...newSchedule};
            const mockStudentMap = new Map<string, string>(); // oldId -> newName
            
            // We need to process each group separately because students are rotated.
            // But wait, students are statically assigned to groups?
            // Yes, `distributeStudentsToGroups` assigns students to groups.
            // And `autoSchedule` respects that.
            // So we can just iterate through students in each group and rename them?
            // No, the user wants "top to bottom" order in the schedule table.
            // The schedule table displays tasks in rows.
            // So for Group X (which corresponds to a column/day), we look at the tasks from top to bottom.
            
            // Let's create a mapping of old_mock_id -> new_name
            // Since a student might appear multiple times in a group (e.g. 2 tasks), we name them on their first appearance.
            
            // Note: The schedule has `taskId::groupIndex`.
            // We iterate groups 0 to groupCount-1.
            // Inside each group, we iterate tasks in `taskOrder`.
            
            const processedStudents = new Set<string>();
 
             for (let g = 0; g < groupCount; g++) {
                 let groupCounter = 1;
                 for (const taskId of taskOrder) {
                     const key = `${taskId}::${g}`;
                     const studentId = newSchedule[key];
                     
                     if (studentId && studentId.startsWith('mock-') && !processedStudents.has(studentId)) {
                         // Found a new mock student assigned to this group
                         const student = renamedStudents.find(s => s.id === studentId);
                         if (student) {
                             // Rename based on Group and Order
                             // Group A (0) -> 拟招A01, 拟招A02...
                             // Group B (1) -> 拟招B01, 拟招B02...
                             
                             const groupName = String.fromCharCode(65 + g); // A, B, C...
                             const newName = `拟招${groupName}${String(groupCounter).padStart(2, '0')}`;
                             
                             student.name = newName;
                             processedStudents.add(studentId);
                             groupCounter++;
                         }
                     }
                 }
             }
            
            setStudents(renamedStudents);
            setAssignments(renamedAssignments);
            setHistory([renamedAssignments]);
            setHistoryIndex(0);
            
            showToast('预览排班完成 (已重命名)');
        } catch (error) {
            console.error(error);
            showToast('预览编排失败', 'error');
        } finally {
            setTimeout(() => setIsCalculating(false), 1000);
        }
    };

    const exitPreviewMode = () => {
        if (previewBackup) {
            setStudents(previewBackup.students);
            setAssignments(previewBackup.assignments);
            setHistory(previewBackup.history);
            setHistoryIndex(previewBackup.historyIndex);
            setPreviewBackup(null);
            showToast('已退出预览模式，恢复原始数据');
        }
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
                },
                { enableTemporaryMode: isTemporaryMode }
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
                },
                { enableTemporaryMode: isTemporaryMode }
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

                const role = row['职务'] || row['角色'];
                // 自动根据职务判断是否为组长
                // 注意：主席团成员不应被标记为组长
                const isLeader = role && (role.includes('部长') || role.includes('组长'));

                return {
                    id: `imported-${idx}`,
                    name: name,
                    department: row['部门'] || Department.DISCIPLINE,
                    grade,
                    classNum,
                    pinyinInitials: py,
                    role, // 支持导入职务
                    isLeader
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
            {姓名: '张三', 部门: '纪检部', 班级: '2-1', 职务: '部长'},
            {姓名: '李四', 部门: '主席团', 班级: '3-5', 职务: '副主席'},
            {姓名: '王五', 部门: '主席团', 班级: '3-1', 职务: '主席'}
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "名单模板");
        XLSX.writeFile(wb, "学生会名单模板.xlsx");
    };

    const getGroupedPersonalTasks = () => {
        const result: {
            groupId: number;
            studentTasks: Record<string, string[]>;
            sortedStudents: Student[];
        }[] = [];

        for (let g = 0; g < groupCount; g++) {
            const groupTasks: Record<string, string[]> = {};
            const groupStudentsSet = new Set<string>();

            Object.entries(assignments).forEach(([key, studentId]) => {
                const [taskId, groupIdxStr] = key.split('::');
                const groupIdx = parseInt(groupIdxStr);

                if (groupIdx !== g) return; // 仅处理当前组

                const task = ALL_TASKS.find(t => t.id === taskId);
                if (!studentId || !task) return;

                if (!groupTasks[studentId]) groupTasks[studentId] = [];
                groupStudentsSet.add(studentId);

                // 格式化任务名称
                let catName = task.category;
                if (catName === TaskCategory.EYE_EXERCISE) catName = '眼操';
                const cleanName = task.name.replace('点位', '').replace(/\(/g, '（').replace(/\)/g, '）');
                const sub = task.subCategory === task.category ? '' : task.subCategory;
                const taskName = `${catName}${sub}${cleanName}`;

                groupTasks[studentId].push(taskName);
            });

            // 学生排序
            const groupStudents = students.filter(s => groupStudentsSet.has(s.id));
            groupStudents.sort((a, b) => {
                if (a.grade !== b.grade) return a.grade - b.grade;
                if (a.classNum !== b.classNum) return a.classNum - b.classNum;
                return a.id.localeCompare(b.id);
            });

            result.push({
                groupId: g,
                studentTasks: groupTasks,
                sortedStudents: groupStudents
            });
        }
        return result;
    };

    const exportPersonalTasks = () => {
        const groupedData = getGroupedPersonalTasks();
        let content = '个人任务清单：\n';

        groupedData.forEach(({groupId, studentTasks, sortedStudents}) => {
            content += `\n========== 第 ${groupId + 1} 组 ==========\n`;
            let currentClass = '';

            sortedStudents.forEach(student => {
                const tasks = studentTasks[student.id];
                if (!tasks || tasks.length === 0) return;

                const className = formatClassName(student.grade, student.classNum);

                if (className !== currentClass) {
                    content += `\n【${className}】\n`;
                    currentClass = className;
                }

                // 对任务进行排序以确保顺序一致
                tasks.sort();

                content += `${student.name}： ${tasks.join('；')}\n`;
            });
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
        setIsExportingImage(true);
        // 给一点时间让 React 渲染合并后的单元格
        setTimeout(async () => {
            const element = document.getElementById('schedule-export-area');
            if (element) {
                const canvas = await html2canvas(element, {
                    scale: imageScale,
                    onclone: (clonedDoc) => {
                        // 1. 隐藏描述文本
                        const desc = clonedDoc.getElementById('schedule-description');
                        if (desc) desc.style.display = 'none';

                        // 1.0 更新标题
                        const titleEl = clonedDoc.querySelector('h1');
                        if (titleEl) {
                            titleEl.innerText = exportTitle;
                        }

                        // 1.1 隐藏校验信息 (如：部门职责不符)
                        const validationMsgs = clonedDoc.querySelectorAll('.validation-msg');
                        validationMsgs.forEach((el: any) => el.style.display = 'none');

                        // 1.2 移除错误状态的红色背景
                        const errorCells = clonedDoc.querySelectorAll('.bg-red-100, .bg-red-50');
                        errorCells.forEach((el: any) => {
                            el.classList.remove('bg-red-100');
                            el.classList.remove('bg-red-50');
                            el.classList.add('bg-white');
                        });

                        // 1.3 移除错误状态的红色文字
                        const errorTexts = clonedDoc.querySelectorAll('.text-red-600');
                        errorTexts.forEach((el: any) => {
                            el.classList.remove('text-red-600');
                            el.classList.add('text-gray-900');
                        });

                        // 1.4 优化字体样式
                        const table = clonedDoc.querySelector('table');
                        if (table) {
                            // 使用更标准的字体，确保垂直居中
                            table.style.fontFamily = '"Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif';
                            
                            // 强制所有单元格垂直居中
                            const cells = table.querySelectorAll('td, th');
                            cells.forEach((cell: any) => {
                                cell.style.verticalAlign = 'middle';
                                // 微调：如果觉得偏下，可能是 line-height 或 padding 的问题
                                // 这里尝试重置 line-height
                                cell.style.lineHeight = '1.4';
                            });

                            // 针对内容 div 进行调整
                            const contentDivs = table.querySelectorAll('.group\\/cell'); // 对应 CellInput 内部的 div
                            contentDivs.forEach((div: any) => {
                                // 确保 flex 居中生效
                                div.style.display = 'flex';
                                div.style.alignItems = 'center';
                                div.style.justifyContent = 'center';
                                div.style.height = '100%';
                                
                                // 移除可能的额外 padding
                                div.style.padding = '0';
                                
                                // 尝试通过 margin-bottom 负值来"提升"文字位置
                                // 或者给内部的 span 加一个 transform
                                const span = div.querySelector('span');
                                if (span) {
                                    span.style.position = 'relative';
                                    span.style.top = '-2px'; // 微调：向上移动 2px (之前是 1px)
                                    span.style.lineHeight = '1.2'; // 紧凑行高
                                }
                            });
                        }

                        // 2. 添加额外内容 (备注、个人清单、页脚)
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

                            // 2.1 备注信息 (现在放在表格后，个人清单前)
                            if (exportRemarks && exportRemarks.trim()) {
                                const remarksContainer = clonedDoc.createElement('div');
                                remarksContainer.style.marginTop = '20px';
                                remarksContainer.style.padding = '15px';
                                remarksContainer.style.backgroundColor = '#f9fafb';
                                remarksContainer.style.border = '1px solid #e5e7eb';
                                remarksContainer.style.borderRadius = '6px';
                                remarksContainer.style.textAlign = 'left';
                                remarksContainer.style.color = '#374151';
                                remarksContainer.style.fontSize = '14px';
                                remarksContainer.style.lineHeight = '1.6';
                                remarksContainer.style.whiteSpace = 'pre-wrap'; // 保留换行
                                
                                const remarksLabel = clonedDoc.createElement('div');
                                remarksLabel.innerText = '备注：';
                                remarksLabel.style.fontWeight = 'bold';
                                remarksLabel.style.marginBottom = '5px';
                                remarksContainer.appendChild(remarksLabel);
                                
                                const remarksContent = clonedDoc.createElement('div');
                                remarksContent.innerText = exportRemarks;
                                remarksContainer.appendChild(remarksContent);
                                
                                container.appendChild(remarksContainer);
                            }

                            // 2.2 个人清单 (可选)
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

                                const groupedData = getGroupedPersonalTasks();

                                groupedData.forEach(({groupId, studentTasks, sortedStudents}) => {
                                    // 组标题
                                    const groupHeader = clonedDoc.createElement('h3');
                                    groupHeader.innerText = `第 ${groupId + 1} 组`;
                                    groupHeader.style.fontSize = '16px';
                                    groupHeader.style.fontWeight = 'bold';
                                    groupHeader.style.marginTop = '15px';
                                    groupHeader.style.paddingBottom = '5px';
                                    groupHeader.style.borderBottom = '1px solid #eee';
                                    groupHeader.style.color = '#4b5563';
                                    listContainer.appendChild(groupHeader);

                                    let currentClass = '';

                                    sortedStudents.forEach(student => {
                                        let tasks = studentTasks[student.id] || [];
                                        if (tasks.length === 0) return;

                                        // 合并显示
                                        // 注意：这里需要根据实际格式化的字符串进行匹配
                                        // 格式化逻辑: `${catName}${sub}${cleanName}`
                                        // 高一(1-3班) -> 高一（1-3班）
                                        // 眼操上午高一 （1-3班）
                                        const hasG1A = tasks.some(t => t.includes('高一 （1-3班）'));
                                        const hasG1B = tasks.some(t => t.includes('高一 （4-6班）'));

                                        if (hasG1A && hasG1B) {
                                            // 移除原来的子任务
                                            tasks = tasks.filter(t => !t.includes('高一 （1-3班）') && !t.includes('高一 （4-6班）'));
                                            // 添加合并后的任务，保留前缀
                                            // 假设前缀都一样（都是“眼操上午”），取第一个找到的作为模板
                                            const template = tasks.find(t => t.includes('高一 （')) || '眼操上午高一';
                                            // 简单替换后缀
                                            const merged = '眼操上午高一'; // 这里简化处理，直接用最常见的情况
                                            tasks.push(merged);
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
                                });

                                container.appendChild(listContainer);
                            }

                            // 2.3 页脚
                            const footer = clonedDoc.createElement('div');
                            footer.style.marginTop = '20px';
                            footer.style.paddingTop = '10px';
                            footer.style.borderTop = '1px solid #eee';
                            footer.style.display = 'flex';
                            footer.style.justifyContent = 'space-between';
                            footer.style.alignItems = 'center';
                            footer.style.color = '#9ca3af';
                            footer.style.fontSize = '12px';

                            const powerBy = clonedDoc.createElement('span');
                            powerBy.innerText = 'Powered By LaoShui @ 2025 | 学生会检查编排系统 | 舟山市六横中学';
                            footer.appendChild(powerBy);

                            const time = clonedDoc.createElement('span');
                            const now = new Date();
                            const timeStr = now.toLocaleString('zh-CN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false
                            });
                            time.innerText = `生成时间：${timeStr}`;
                            footer.appendChild(time);

                            container.appendChild(footer);
                        }
                    }
                });
                canvas.toBlob(blob => {
                    if (blob) saveAs(blob, "检查安排表.png");
                });
                setIsExportingImage(false);
                setExportDialog({isOpen: false, type: null});
            } else {
                setIsExportingImage(false);
            }
        }, 100);
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

    const handleToggleLeader = (studentId: string) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? {...s, isLeader: !s.isLeader} : s
        ));
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white border-b px-6 py-4 flex flex-wrap gap-y-4 justify-between items-center shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-primary flex items-center justify-center rounded-lg overflow-hidden shadow-md">
                        <img src="/images/zslhzxLOGO.png" alt="Logo" className="h-10 w-auto object-contain p-1"/>
                    </div>
                    <h1 className="font-bold text-xl text-gray-800 whitespace-nowrap">学生会检查编排系统</h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
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
                        <span className="text-sm text-gray-600 font-medium whitespace-nowrap">组数:</span>
                        <div
                            className="relative cursor-pointer flex items-center gap-1 min-w-[3rem] justify-between"
                            onClick={() => setIsGroupSelectOpen(!isGroupSelectOpen)}
                        >
                            <span className="text-sm font-bold text-primary whitespace-nowrap">{groupCount}</span>
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


                    {previewBackup && (
                        <button
                            onClick={exitPreviewMode}
                            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition shadow-sm whitespace-nowrap animate-pulse"
                        >
                            <Undo2 size={16}/> 退出预览模式
                        </button>
                    )}

                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition whitespace-nowrap"
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
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition whitespace-nowrap"
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
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition whitespace-nowrap"
                    >
                        <FileJson size={16}/> 导入数据
                    </button>

                    <button
                        onClick={() => setIsAnalysisModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm transition shadow-sm whitespace-nowrap"
                    >
                        <Users size={16}/> 空缺分析
                    </button>

                    <div className="h-6 w-px bg-gray-300 mx-2"></div>

                    <button
                        onClick={() => setIsTemporaryMode(!isTemporaryMode)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition shadow-sm whitespace-nowrap ${
                            isTemporaryMode 
                            ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                        title="临时匹配模式：允许主席团检查上午包干区，且强制分配纪检/学习/主席团"
                    >
                        <Users size={16}/> {isTemporaryMode ? '临时模式开启' : '临时模式'}
                    </button>

                    <button
                        onClick={handleAutoSchedule}
                        className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-blue-600 text-white rounded-md text-sm transition shadow-sm whitespace-nowrap"
                    >
                        <Wand2 size={16}/> 智能编排
                    </button>

                    <button
                        onClick={handleAutoComplete}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm transition shadow-sm whitespace-nowrap"
                    >
                        <Sparkles size={16}/> 自动补全
                    </button>

                    <button
                        onClick={() => setIsSwapModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm transition shadow-sm whitespace-nowrap"
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
                <StudentList students={students} taskCounts={taskCounts} onToggleLeader={handleToggleLeader} />

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
                    enableMerge={isExportingImage}
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

            <RecruitmentAnalysisModal
                isOpen={isAnalysisModalOpen}
                onClose={() => setIsAnalysisModalOpen(false)}
                students={students}
                onPreview={handleRecruitmentPreview}
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">表格标题</label>
                            <input
                                type="text"
                                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary outline-none"
                                value={exportTitle}
                                onChange={(e) => setExportTitle(e.target.value)}
                                placeholder="请输入标题"
                            />
                        </div>
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

                {exportDialog.type === 'image' && (
                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">备注信息</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary outline-none resize-none"
                            rows={3}
                            placeholder="在此输入备注信息，将显示在图片底部..."
                            value={exportRemarks}
                            onChange={(e) => setExportRemarks(e.target.value)}
                        />
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
