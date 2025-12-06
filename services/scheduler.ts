import {Student, TaskCategory, TaskDefinition, TimeSlot} from '../types';
import {ALL_TASKS, SPECIAL_DEPARTMENTS} from '../constants';

// 辅助函数: 检查学生是否可以执行任务
export const canAssign = (student: Student, task: TaskDefinition): { valid: boolean; reason?: string } => {
    // 1. 部门职责检查
    if (!task.allowedDepartments.includes(student.department)) {
        return {valid: false, reason: '部门职责不符'};
    }

    // 2. 眼操班级组冲突检查
    if (task.forbiddenClassGroup) {
        if (
            student.grade === task.forbiddenClassGroup.grade &&
            student.classNum >= task.forbiddenClassGroup.minClass &&
            student.classNum <= task.forbiddenClassGroup.maxClass
        ) {
            return {valid: false, reason: '需避嫌(本班所在组)'};
        }
    }

    // 3. 上午眼保健操高三不参与检查
    if (task.timeSlot === TimeSlot.EYE_AM && student.grade === 3) {
        return {valid: false, reason: '高三不参与该项检查'};
    }

    // 4. 晚自习年级冲突检查
    if (task.forbiddenGrade && student.grade === task.forbiddenGrade) {
        return {valid: false, reason: '需避嫌(本年级)'};
    }

    return {valid: true};
};

// 辅助函数: 检查学生是否已经在该组被过度分配或有冲突
export const checkGroupAvailability = (
    student: Student,
    task: TaskDefinition,
    groupId: number,
    currentAssignments: Record<string, string>, // 键: taskId::groupId
    conflicts: ConflictInfo[] = []
): { valid: boolean; reason?: string } => {
    // 1. 基础资格检查
    const basicCheck = canAssign(student, task);
    if (!basicCheck.valid) return basicCheck;

    // 2. 收集该学生在当前组已分配的任务，并检查跨组冲突
    const assignedTaskIds: string[] = [];
    let otherGroupAssignment: number | undefined;

    Object.entries(currentAssignments).forEach(([key, sid]) => {
        if (sid !== student.id) return;
        const [tid, gStr] = key.split('::');
        const gId = parseInt(gStr);

        if (gId === groupId) {
            // 排除当前正在判断的任务本身，避免自我冲突
            // 例如: 检查 "是否可以做包干区"，如果已经分配了该包干区，不应算作"已有包干区"的互斥
            if (tid !== task.id) {
                assignedTaskIds.push(tid);
            }
        } else {
            otherGroupAssignment = gId;
        }
    });

    if (otherGroupAssignment !== undefined) {
        return {valid: false, reason: `已在第${otherGroupAssignment + 1}组`};
    }

    // 3. 检查负载 (Max 2)
    // 特殊情况: 眼操可以允许超载 (>=3) 如果其他条件允许，但此处我们做严格建议，除非是手动分配
    // 用户反馈 "推荐人会导致冲突"，所以这里应该严格一点
    if (assignedTaskIds.length >= 2) {
        // 检查是否允许例外: 已有包干区(1) + 申请眼操(1) -> 允许 -> 2
        // 如果已经是2了，再加就是3，一般不允许
        // 除非: 现有任务是 眼操AM + 眼操PM (2) -> 再加? 不行
        return {valid: false, reason: '负载已满'};
    }

    // 4. 检查互斥 (包干区 vs 晚自习)
    const assignedTasks = assignedTaskIds.map(tid => ALL_TASKS.find(t => t.id === tid)!);
    const hasCleaning = assignedTasks.some(t => t.category === TaskCategory.CLEANING);
    const hasEvening = assignedTasks.some(t => t.category === TaskCategory.EVENING_STUDY);

    if (task.category === TaskCategory.CLEANING && hasEvening) return {valid: false, reason: '早晚互斥'};
    if (task.category === TaskCategory.EVENING_STUDY && hasCleaning) return {valid: false, reason: '早晚互斥'};

    // 5. 检查同类互斥 (一人一个包干区)
    if (task.category === TaskCategory.CLEANING && hasCleaning) return {valid: false, reason: '已有包干区'};
    if (task.category === TaskCategory.EVENING_STUDY && hasEvening) return {valid: false, reason: '已有晚自习'};

    // 6. 检查时间冲突
    // 室内课间操无视时间冲突
    const isIndoorInterval = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
    if (!isIndoorInterval) {
        for (const assignedTask of assignedTasks) {
            const isAssignedIndoor = assignedTask.category === TaskCategory.INTERVAL_EXERCISE && assignedTask.subCategory === '室内';
            if (isAssignedIndoor) continue;

            if (assignedTask.timeSlot === task.timeSlot) {
                return {valid: false, reason: `时间冲突 (${task.timeSlot})`};
            }
        }
    }

    return {valid: true};
}

// 辅助函数: 将学生均匀分配到各组
// 增加随机性以确保每次结果不同
// 增加 lockedAssignments 参数，确保已手动分配的学生被锁定在特定组，不参与其他组的分配
const distributeStudentsToGroups = (
    students: Student[],
    numGroups: number,
    lockedAssignments: Map<string, Set<number>>
): Student[][] => {
    const groups: Student[][] = Array.from({length: numGroups}, () => []);

    // 1. 处理已锁定（手动分配）的学生
    // 记录已被锁定的学生ID，避免重复分配到其他组
    const lockedStudentIds = new Set<string>();

    lockedAssignments.forEach((gIds, sId) => {
        const student = students.find(s => s.id === sId);
        if (student) {
            lockedStudentIds.add(sId);
            gIds.forEach(gId => {
                if (gId >= 0 && gId < numGroups) {
                    groups[gId].push(student);
                }
            });
        }
    });

    // 2. 筛选出未分配的学生 (完全自由的学生)
    const availableStudents = students.filter(s => !lockedStudentIds.has(s.id));

    // 3. 打乱未分配学生
    const shuffledStudents = [...availableStudents].sort(() => Math.random() - 0.5);

    // 分离特殊部门和常规部门
    const specialStudents: Student[] = [];
    const regularStudents: Student[] = [];

    shuffledStudents.forEach(s => {
        if (SPECIAL_DEPARTMENTS.includes(s.department)) {
            specialStudents.push(s);
        } else {
            regularStudents.push(s);
        }
    });

    // 4. 特殊部门 (SPECIAL_DEPARTMENTS) 分配
    // 特殊部门只负责室内课间操，无年级限制，所以直接均匀分配即可
    // 必须保证每组分到足够数量的特殊部门成员 (室内课间操有5个岗位)
    let groupOffset = Math.floor(Math.random() * numGroups);

    specialStudents.forEach((s, idx) => {
        groups[(idx + groupOffset) % numGroups].push(s);
    });

    // 5. 常规部门 (REGULAR_DEPARTMENTS) 分配
    // 常规部门负责晚自习等，有严格的年级避嫌要求，必须按 年级+部门 细分
    const bucketMap: Record<string, Student[]> = {};
    regularStudents.forEach(s => {
        const key = `${s.department}-${s.grade}`;
        if (!bucketMap[key]) bucketMap[key] = [];
        bucketMap[key].push(s);
    });

    // 轮询分配各 Bucket 成员到组
    // 为了避免所有 Bucket 都从 Group 0 开始填充导致前几组人数偏多
    // 我们使用一个全局计数器或者随机起始偏移
    groupOffset = (groupOffset + 1) % numGroups;

    Object.values(bucketMap).forEach(bucketStudents => {
        bucketStudents.forEach((s, idx) => {
            groups[(idx + groupOffset) % numGroups].push(s);
        });
        // 每个 bucket 分配完后，偏移量移动，确保下一批人从不同的组开始塞
        groupOffset = (groupOffset + 1) % numGroups;
    });

    return groups;
};

// --- 模拟退火支持 ---

// 简化的冲突计算，用于 SA 快速评估能量
const calculateEnergy = (
    assignments: Record<string, string>,
    students: Student[],
    numGroups: number
): number => {
    let energy = 0;
    const studentMap = new Map(students.map(s => [s.id, s]));

    // 1. 未分配任务惩罚 (权重 10000)
    const totalSlots = ALL_TASKS.length * numGroups;
    const assignedCount = Object.keys(assignments).length;
    energy += (totalSlots - assignedCount) * 10000;

    // 预处理: 组 -> 学生 -> 任务
    const groupUsage: Record<number, Record<string, TaskDefinition[]>> = {};
    // 预处理: 学生 -> 组
    const studentGroups: Record<string, Set<number>> = {};

    Object.entries(assignments).forEach(([key, sid]) => {
        const [tid, gStr] = key.split('::');
        const gId = parseInt(gStr);
        const task = ALL_TASKS.find(t => t.id === tid);
        if (!task || !studentMap.has(sid)) return;

        if (!groupUsage[gId]) groupUsage[gId] = {};
        if (!groupUsage[gId][sid]) groupUsage[gId][sid] = [];
        groupUsage[gId][sid].push(task);

        if (!studentGroups[sid]) studentGroups[sid] = new Set();
        studentGroups[sid].add(gId);
    });

    // 2. 跨组冲突 (权重 5000)
    Object.values(studentGroups).forEach(groups => {
        if (groups.size > 1) energy += (groups.size - 1) * 5000;
    });

    // 3. 组内规则冲突
    Object.values(groupUsage).forEach(groupStudents => {
        Object.entries(groupStudents).forEach(([sid, tasks]) => {
            // 负载检查
            let maxLoad = 2;
            const eyeCount = tasks.filter(t => t.category === TaskCategory.EYE_EXERCISE).length;
            // 豁免逻辑: 如果任务数=3且含2眼操，允许
            if (tasks.length === 3 && eyeCount >= 2) maxLoad = 3;

            if (tasks.length > maxLoad) {
                energy += (tasks.length - maxLoad) * 2000; // 过载惩罚
            }

            // 互斥检查
            const hasCleaning = tasks.some(t => t.category === TaskCategory.CLEANING);
            const hasEvening = tasks.some(t => t.category === TaskCategory.EVENING_STUDY);
            if (hasCleaning && hasEvening) energy += 3000; // 严重互斥

            // 同类互斥
            const cleanCount = tasks.filter(t => t.category === TaskCategory.CLEANING).length;
            const eveningCount = tasks.filter(t => t.category === TaskCategory.EVENING_STUDY).length;
            if (cleanCount > 1) energy += (cleanCount - 1) * 2000;
            if (eveningCount > 1) energy += (eveningCount - 1) * 2000;

            // 时间冲突
            const timeSlots = new Set<string>();
            tasks.forEach(t => {
                if (t.category === TaskCategory.INTERVAL_EXERCISE && t.subCategory === '室内') return;
                if (timeSlots.has(t.timeSlot)) {
                    energy += 1500; // 时间冲突惩罚
                }
                timeSlots.add(t.timeSlot);
            });
        });
    });

    // 4. 负载方差 (权重 10) - 优化目标
    // 仅计算已分配学生的负载方差
    let sumSq = 0;
    Object.values(groupUsage).forEach(g => Object.values(g).forEach(tasks => sumSq += tasks.length * tasks.length));
    energy += sumSq * 10;

    return energy;
};

// 尝试使用模拟退火优化排班
export const optimizeWithSA = (
    initialAssignments: Record<string, string>,
    students: Student[],
    numGroups: number
): Record<string, string> => {
    let currentAssignments = {...initialAssignments};

    // 1. 填充未分配的任务 (随机分配给符合硬性约束的人，暂时忽略软约束)
    // 这是为了让 SA 有一个完整的解空间去优化
    const studentMap = new Map(students.map(s => [s.id, s]));

    // 按组归类学生，方便快速查找
    const studentsByGroup: Student[][] = Array.from({length: numGroups}, () => []);
    // 简单地全量分配，这里我们假设学生已经通过某种方式分好组了？
    // 不，这里我们拿到的 students 是全量的。我们需要知道哪些学生属于哪个组。
    // 我们可以推断：如果学生在 initialAssignments 中出现过在某组，他就属于该组。
    // 对于没出现过的学生，随机分配一个组归属。

    const studentGroupMap = new Map<string, number>();
    Object.entries(currentAssignments).forEach(([key, sid]) => {
        const [_, gStr] = key.split('::');
        studentGroupMap.set(sid, parseInt(gStr));
    });

    students.forEach(s => {
        if (!studentGroupMap.has(s.id)) {
            // 这是一个未被分配任务的学生，随机分配一个组归属，作为潜在替补
            const gId = Math.floor(Math.random() * numGroups);
            studentGroupMap.set(s.id, gId);
        }
        const gId = studentGroupMap.get(s.id)!;
        if (gId >= 0 && gId < numGroups) {
            studentsByGroup[gId].push(s);
        }
    });

    // 填充空缺
    ALL_TASKS.forEach(task => {
        for (let g = 0; g < numGroups; g++) {
            const key = `${task.id}::${g}`;
            if (!currentAssignments[key]) {
                // 尝试寻找一个符合硬性约束(部门/年级)的学生
                const candidates = studentsByGroup[g].filter(s => canAssign(s, task).valid);
                if (candidates.length > 0) {
                    const randomStudent = candidates[Math.floor(Math.random() * candidates.length)];
                    currentAssignments[key] = randomStudent.id;
                }
            }
        }
    });

    let currentEnergy = calculateEnergy(currentAssignments, students, numGroups);
    let bestAssignments = {...currentAssignments};
    let bestEnergy = currentEnergy;

    // SA 参数
    let temperature = 1000;
    const coolingRate = 0.995;
    const minTemperature = 0.1;

    while (temperature > minTemperature) {
        // 创建邻域解
        const newAssignments = {...currentAssignments};
        const taskKeys = Object.keys(newAssignments);
        if (taskKeys.length === 0) break;

        // 随机选择一个任务进行变异
        const randomKey = taskKeys[Math.floor(Math.random() * taskKeys.length)];
        const [taskId, gStr] = randomKey.split('::');
        const groupId = parseInt(gStr);
        const task = ALL_TASKS.find(t => t.id === taskId);

        if (task) {
            // 变异策略: 重新分配给组内另一个符合硬性约束的学生
            const groupStudents = studentsByGroup[groupId];
            const candidates = groupStudents.filter(s => canAssign(s, task).valid);

            if (candidates.length > 0) {
                const newStudent = candidates[Math.floor(Math.random() * candidates.length)];
                newAssignments[randomKey] = newStudent.id;

                // 计算新能量
                const newEnergy = calculateEnergy(newAssignments, students, numGroups);
                const delta = newEnergy - currentEnergy;

                // 接受准则
                if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
                    currentAssignments = newAssignments;
                    currentEnergy = newEnergy;

                    if (currentEnergy < bestEnergy) {
                        bestEnergy = currentEnergy;
                        bestAssignments = {...currentAssignments};
                    }
                }
            }
        }

        temperature *= coolingRate;
    }

    return bestAssignments;
};

export const autoScheduleMultiGroup = (
    students: Student[],
    currentAssignments: Record<string, string>, // 键格式: taskId::groupId
    numGroups: number
): Record<string, string> => {
    let bestAssignments: Record<string, string> = {};
    let maxFilledCount = -1;
    let minLoadVariance = Infinity; // 追踪负载方差（平方和），越小越均衡
    const totalSlots = ALL_TASKS.length * numGroups;
    const MAX_RETRIES = 100; // 重试次数

    // 预处理锁定信息: studentId -> Set<groupId>
    const lockedAssignments = new Map<string, Set<number>>();
    Object.entries(currentAssignments).forEach(([key, sId]) => {
        const [_, gStr] = key.split('::');
        const gId = parseInt(gStr);
        if (!lockedAssignments.has(sId)) lockedAssignments.set(sId, new Set());
        lockedAssignments.get(sId)!.add(gId);
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // 复制当前分配（通常为空，因为是重新编排）
        const newAssignments = {...currentAssignments};

        // 将学生分配到不重叠的组池中 (考虑已锁定的学生)
        const studentsPerGroup = distributeStudentsToGroups(students, numGroups, lockedAssignments);

        // 任务排序策略
        const sortedTasks = [...ALL_TASKS].sort((a, b) => {
            // 优先级 1: 部门限制 (越难分配的越先排)
            const deptDiff = a.allowedDepartments.length - b.allowedDepartments.length;
            if (deptDiff !== 0) return deptDiff;

            // 优先级 2: 硬性约束 (晚自习有年级限制)
            if (a.forbiddenGrade && !b.forbiddenGrade) return -1;
            if (!a.forbiddenGrade && b.forbiddenGrade) return 1;

            return 0;
        });

        // 逐组进行编排
        for (let g = 0; g < numGroups; g++) {
            const groupWorkload: Record<string, number> = {}; // 记录每个人在当前组的任务数
            const studentCategories: Record<string, Set<TaskCategory>> = {}; // 记录已分配的任务类别
            const studentTimeSlots: Record<string, Set<TimeSlot>> = {}; // 记录已占用的时间段

            // 仅使用分配给该组的学生池
            const groupStudents = studentsPerGroup[g];

            // 初始化追踪器
            groupStudents.forEach(s => {
                groupWorkload[s.id] = 0;
                studentCategories[s.id] = new Set();
                studentTimeSlots[s.id] = new Set();
            });

            // 扫描当前手动锁定的分配，更新负载状态
            ALL_TASKS.forEach(task => {
                const key = `${task.id}::${g}`;
                const sid = newAssignments[key];
                if (sid) {
                    if (groupWorkload[sid] !== undefined) {
                        groupWorkload[sid] = (groupWorkload[sid] || 0) + 1;
                        studentCategories[sid].add(task.category);
                        studentTimeSlots[sid].add(task.timeSlot);
                    }
                }
            });

            for (const task of sortedTasks) {
                const key = `${task.id}::${g}`;
                // 如果已分配则跳过
                if (newAssignments[key]) continue;

                // 在组内池中寻找候选人
                // 第一轮筛选: 尝试找到符合 "每组最大任务数 <= 2" 且 "大项目只排一个" 的候选人
                // 同时优先保证 "一人一岗" (负载尽量低)
                let candidates = groupStudents.filter(student => {
                    // 规则 1: 组内互斥 (由 groupStudents 保证)

                    // 规则 2: 负载限制 (基础限制 2)
                    // 注意: 如果人员不足，后续会放宽此限制，但此处先严格限制
                    if (groupWorkload[student.id] >= 2) return false;

                    // 规则 3: 时间段冲突
                    // 特殊: 室内课间操不检查时间冲突
                    const isIndoorInterval = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
                    if (!isIndoorInterval && studentTimeSlots[student.id].has(task.timeSlot)) return false;

                    // 规则 4: 任务特定约束 (部门、避嫌)
                    if (!canAssign(student, task).valid) return false;

                    // 规则 5: 互斥逻辑 (大项目互斥)
                    const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                    const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);

                    // 包干区 和 晚自习 绝对互斥
                    if (task.category === TaskCategory.EVENING_STUDY && hasCleaning) return false;
                    if (task.category === TaskCategory.CLEANING && hasEvening) return false;

                    // 相同大项目互斥 (一人只能一个包干区，一人只能一个晚自习)
                    if (task.category === TaskCategory.CLEANING && hasCleaning) return false;
                    if (task.category === TaskCategory.EVENING_STUDY && hasEvening) return false;

                    return true;
                });

                // 如果第一轮没找到，且当前任务是 眼操，尝试放宽负载限制
                // "眼操上午下午可以安排部分人员都检查... 尽量一人一个"
                if (candidates.length === 0 && task.category === TaskCategory.EYE_EXERCISE) {
                    candidates = groupStudents.filter(student => {
                        // 放宽负载限制: 允许 > 2 (例如 3: 包干 + 眼操AM + 眼操PM)
                        // 但仍需遵守互斥和时间冲突

                        // 必须遵守时间冲突
                        if (studentTimeSlots[student.id].has(task.timeSlot)) return false;

                        // 必须遵守任务特定约束
                        if (!canAssign(student, task).valid) return false;

                        const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                        const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);

                        // 仍然保持大项目互斥
                        if (hasCleaning && hasEvening) return false; // 理论上不应发生，但防御性检查

                        // NEW: 严格限制 - 如果已经有晚自习，不能再加任务（晚自习通常比较重）
                        if (hasEvening) return false;

                        // NEW: 严格限制 - 如果已经有2个任务，且其中没有眼操，说明是 "包干+其他"，再加就是3个
                        // 我们希望只有在 "包干+眼操" 的基础上再加 "眼操"
                        // 或者 "眼操+眼操" -> "眼操+眼操+眼操" (理论上)
                        // 防止 "包干+晚自习"(已互斥) 或 "包干+课间操" -> 加眼操变3个 (1个眼操) -> 冲突

                        // 规则: 如果已经是2个任务，必须保证其中至少有一个是眼操
                        // 这样加上当前的眼操后，总共3个任务中至少有2个眼操，符合豁免条件
                        if (groupWorkload[student.id] === 2 && !studentCategories[student.id].has(TaskCategory.EYE_EXERCISE)) {
                            return false;
                        }

                        // 检查当前负载
                        // 如果已经 >= 3，绝对不行
                        if (groupWorkload[student.id] >= 3) return false;

                        return true;
                    });
                }

                if (candidates.length === 0) continue;

                // 候选人打分排序
                candidates.sort((a, b) => {
                    const loadA = groupWorkload[a.id];
                    const loadB = groupWorkload[b.id];

                    // 优先选负载最低的
                    if (loadA !== loadB) return loadA - loadB;

                    // 进阶逻辑: 组合偏好

                    // 1. 包干区偏好: 高二 > 高三 > 高一
                    if (task.category === TaskCategory.CLEANING) {
                        // 如果是 "迟到" 检查，也算作包干区的一种，同样优先高二
                        // 逻辑保持一致
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                        if (a.grade === 3 && b.grade !== 3) return -1;
                        if (b.grade === 3 && a.grade !== 3) return 1;
                    }

                    // 2. 眼操偏好: 优先给已经有包干区的人 (凑成 包干+眼操)
                    if (task.category === TaskCategory.EYE_EXERCISE) {
                        const hasCleanA = studentCategories[a.id].has(TaskCategory.CLEANING);
                        const hasCleanB = studentCategories[b.id].has(TaskCategory.CLEANING);
                        if (hasCleanA && !hasCleanB) return -1;
                        if (!hasCleanA && hasCleanB) return 1;
                    }

                    // 增加随机扰动，避免排序稳定性导致总是选择同一批人
                    return Math.random() - 0.5;
                });

                const bestCandidate = candidates[0];
                newAssignments[key] = bestCandidate.id;

                // 更新追踪器
                groupWorkload[bestCandidate.id]++;
                studentCategories[bestCandidate.id].add(task.category);
                studentTimeSlots[bestCandidate.id].add(task.timeSlot);
            }
        }

        // 检查本次分配的完整度
        const filledCount = Object.keys(newAssignments).length;

        // 计算负载均衡度
        // Sum(x^2) 越小，说明分布越均匀 (例如 2+2 < 3+1 => 8 < 10)
        const studentTotalLoad: Record<string, number> = {};
        Object.values(newAssignments).forEach(sid => {
            studentTotalLoad[sid] = (studentTotalLoad[sid] || 0) + 1;
        });

        let currentLoadVariance = 0;
        Object.values(studentTotalLoad).forEach(load => {
            currentLoadVariance += load * load;
        });

        // 必须优先保证覆盖率 filledCount
        // 在覆盖率相同的情况下，优先选择负载更均衡的方案
        if (filledCount > maxFilledCount) {
            maxFilledCount = filledCount;
            minLoadVariance = currentLoadVariance;
            bestAssignments = newAssignments;
        } else if (filledCount === maxFilledCount) {
            if (currentLoadVariance < minLoadVariance) {
                minLoadVariance = currentLoadVariance;
                bestAssignments = newAssignments;
            }
        }
    }

    // 返回多次尝试中的最佳结果
    return bestAssignments;
};

export interface CalculationStats {
    attempt: number;
    maxAttempts: number; // 新增：最大尝试次数
    coverage: number;
    totalSlots: number;
    variance: number;
    bestCoverage: number;
    bestVariance: number;
}

export const autoScheduleMultiGroupAsync = async (
    students: Student[],
    currentAssignments: Record<string, string>,
    numGroups: number,
    onProgress: (log: string, stats?: CalculationStats) => void
): Promise<Record<string, string>> => {
    let bestAssignments: Record<string, string> = {};
    let maxFilledCount = -1;
    let minLoadVariance = Infinity;
    const totalSlots = ALL_TASKS.length * numGroups;
    const MAX_RETRIES = 100;

    const lockedAssignments = new Map<string, Set<number>>();
    Object.entries(currentAssignments).forEach(([key, sId]) => {
        const [_, gStr] = key.split('::');
        const gId = parseInt(gStr);
        if (!lockedAssignments.has(sId)) lockedAssignments.set(sId, new Set());
        lockedAssignments.get(sId)!.add(gId);
    });

    onProgress(`初始化完成，准备进行 ${MAX_RETRIES} 次尝试...`, {
        attempt: 0,
        maxAttempts: MAX_RETRIES,
        coverage: 0,
        totalSlots,
        variance: 0,
        bestCoverage: 0,
        bestVariance: 0
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // 允许UI渲染，但不增加额外延迟
        await new Promise(resolve => setTimeout(resolve, 0));

        const newAssignments = {...currentAssignments};
        const studentsPerGroup = distributeStudentsToGroups(students, numGroups, lockedAssignments);

        const sortedTasks = [...ALL_TASKS].sort((a, b) => {
            const deptDiff = a.allowedDepartments.length - b.allowedDepartments.length;
            if (deptDiff !== 0) return deptDiff;
            if (a.forbiddenGrade && !b.forbiddenGrade) return -1;
            if (!a.forbiddenGrade && b.forbiddenGrade) return 1;
            return 0;
        });

        for (let g = 0; g < numGroups; g++) {
            const groupWorkload: Record<string, number> = {};
            const studentCategories: Record<string, Set<TaskCategory>> = {};
            const studentTimeSlots: Record<string, Set<TimeSlot>> = {};
            const groupStudents = studentsPerGroup[g];

            groupStudents.forEach(s => {
                groupWorkload[s.id] = 0;
                studentCategories[s.id] = new Set();
                studentTimeSlots[s.id] = new Set();
            });

            ALL_TASKS.forEach(task => {
                const key = `${task.id}::${g}`;
                const sid = newAssignments[key];
                if (sid) {
                    if (groupWorkload[sid] !== undefined) {
                        groupWorkload[sid] = (groupWorkload[sid] || 0) + 1;
                        studentCategories[sid].add(task.category);
                        studentTimeSlots[sid].add(task.timeSlot);
                    }
                }
            });

            for (const task of sortedTasks) {
                const key = `${task.id}::${g}`;
                if (newAssignments[key]) continue;

                let candidates = groupStudents.filter(student => {
                    if (groupWorkload[student.id] >= 2) return false;
                    const isIndoorInterval = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
                    if (!isIndoorInterval && studentTimeSlots[student.id].has(task.timeSlot)) return false;
                    if (!canAssign(student, task).valid) return false;

                    const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                    const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);
                    if (task.category === TaskCategory.EVENING_STUDY && hasCleaning) return false;
                    if (task.category === TaskCategory.CLEANING && hasEvening) return false;
                    if (task.category === TaskCategory.CLEANING && hasCleaning) return false;
                    if (task.category === TaskCategory.EVENING_STUDY && hasEvening) return false;
                    return true;
                });

                if (candidates.length === 0 && task.category === TaskCategory.EYE_EXERCISE) {
                    candidates = groupStudents.filter(student => {
                        if (studentTimeSlots[student.id].has(task.timeSlot)) return false;
                        if (!canAssign(student, task).valid) return false;
                        const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                        const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);
                        if (hasEvening) return false;
                        if (groupWorkload[student.id] === 2 && !studentCategories[student.id].has(TaskCategory.EYE_EXERCISE)) return false;
                        if (groupWorkload[student.id] >= 3) return false;
                        return true;
                    });
                }

                if (candidates.length === 0) continue;

                candidates.sort((a, b) => {
                    const loadA = groupWorkload[a.id];
                    const loadB = groupWorkload[b.id];
                    if (loadA !== loadB) return loadA - loadB;

                    // 1. 包干区偏好: 高二 > 高三 > 高一
                    if (task.category === TaskCategory.CLEANING) {
                        // 如果是 "迟到" 检查，也算作包干区的一种，同样优先高二
                        // 逻辑保持一致
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                        if (a.grade === 3 && b.grade !== 3) return -1;
                        if (b.grade === 3 && a.grade !== 3) return 1;
                    }

                    if (task.category === TaskCategory.EYE_EXERCISE) {
                        const hasCleanA = studentCategories[a.id].has(TaskCategory.CLEANING);
                        const hasCleanB = studentCategories[b.id].has(TaskCategory.CLEANING);
                        if (hasCleanA && !hasCleanB) return -1;
                        if (!hasCleanA && hasCleanB) return 1;
                    }
                    return Math.random() - 0.5;
                });

                const bestCandidate = candidates[0];
                newAssignments[key] = bestCandidate.id;
                groupWorkload[bestCandidate.id]++;
                studentCategories[bestCandidate.id].add(task.category);
                studentTimeSlots[bestCandidate.id].add(task.timeSlot);
            }
        }

        const filledCount = Object.keys(newAssignments).length;
        const studentTotalLoad: Record<string, number> = {};
        Object.values(newAssignments).forEach(sid => {
            studentTotalLoad[sid] = (studentTotalLoad[sid] || 0) + 1;
        });

        let currentLoadVariance = 0;
        Object.values(studentTotalLoad).forEach(load => {
            currentLoadVariance += load * load;
        });

        const logMsg = `[Attempt ${attempt + 1}] 覆盖率: ${(filledCount / totalSlots * 100).toFixed(1)}% (${filledCount}/${totalSlots}) 方差: ${currentLoadVariance}`;

        const currentStats: CalculationStats = {
            attempt: attempt + 1,
            maxAttempts: MAX_RETRIES,
            coverage: filledCount,
            totalSlots,
            variance: currentLoadVariance,
            bestCoverage: maxFilledCount < 0 ? 0 : maxFilledCount,
            bestVariance: minLoadVariance === Infinity ? 0 : minLoadVariance
        };

        onProgress(logMsg, currentStats);

        if (filledCount > maxFilledCount) {
            maxFilledCount = filledCount;
            minLoadVariance = currentLoadVariance;
            bestAssignments = newAssignments;
            onProgress(`>>> 发现更优解! 覆盖率提升至 ${filledCount}. Cost = Var(${currentLoadVariance}) - Cov(${filledCount})`, {
                ...currentStats,
                bestCoverage: maxFilledCount,
                bestVariance: minLoadVariance
            });
        } else if (filledCount === maxFilledCount) {
            if (currentLoadVariance < minLoadVariance) {
                minLoadVariance = currentLoadVariance;
                bestAssignments = newAssignments;
                onProgress(`>>> 发现更优解! 方差优化至 ${currentLoadVariance}. Cost = Var(${currentLoadVariance}) - Cov(${filledCount})`, {
                    ...currentStats,
                    bestCoverage: maxFilledCount,
                    bestVariance: minLoadVariance
                });
            }
        }
    }

    onProgress(`计算完成。最终覆盖率: ${maxFilledCount}/${totalSlots}`, {
        attempt: MAX_RETRIES,
        maxAttempts: MAX_RETRIES,
        coverage: maxFilledCount,
        totalSlots,
        variance: minLoadVariance,
        bestCoverage: maxFilledCount,
        bestVariance: minLoadVariance
    });
    return bestAssignments;
};

export interface ConflictInfo {
    taskId: string;
    groupId: number;
    studentId: string;
    reason: string;
    type: 'error' | 'warning'; // 区分 错误 和 警告
}

export interface SuggestionInfo {
    conflict: ConflictInfo;
    suggestedStudentId?: string;
    suggestedReason?: string;
}

export const getScheduleConflicts = (
    students: Student[],
    assignments: Record<string, string>,
    groupCount: number
): ConflictInfo[] => {
    const conflicts: ConflictInfo[] = [];
    const studentMap = new Map(students.map(s => [s.id, s]));

    // 追踪数据结构: groupId -> studentId -> { tasks: ..., timeSlots: ... }
    const groupUsage: Record<number, Record<string, {
        tasks: { id: string, task: TaskDefinition }[],
    }>> = {};

    // 追踪跨组: studentId -> Set<groupId>
    const studentGroups: Record<string, Set<number>> = {};

    // 1. 构建数据视图
    Object.entries(assignments).forEach(([key, studentId]) => {
        const [taskId, groupIdStr] = key.split('::');
        const groupId = parseInt(groupIdStr);
        const task = ALL_TASKS.find(t => t.id === taskId);

        // 如果任务ID有效且学生存在
        if (task && studentMap.has(studentId)) {
            // 记录跨组
            if (!studentGroups[studentId]) studentGroups[studentId] = new Set();
            studentGroups[studentId].add(groupId);

            // 记录组内使用情况
            if (!groupUsage[groupId]) groupUsage[groupId] = {};
            if (!groupUsage[groupId][studentId]) {
                groupUsage[groupId][studentId] = {tasks: []};
            }
            groupUsage[groupId][studentId].tasks.push({id: taskId, task});
        }
    });

    // 2. 检查跨组警告
    Object.entries(studentGroups).forEach(([studentId, groups]) => {
        if (groups.size > 1) {
            groups.forEach(groupId => {
                const usage = groupUsage[groupId]?.[studentId];
                if (usage && usage.tasks.length > 0) {
                    // 只在第一个任务上标记，避免过多重复
                    conflicts.push({
                        taskId: usage.tasks[0].id,
                        groupId,
                        studentId,
                        reason: `多组任务 (${Array.from(groups).map(g => g + 1).join(',')})`,
                        type: 'error'
                    });
                }
            });
        }
    });

    // 3. 检查组内规则
    Object.keys(groupUsage).forEach(gIdStr => {
        const groupId = parseInt(gIdStr);
        const studentsInGroup = groupUsage[groupId];

        Object.entries(studentsInGroup).forEach(([studentId, usage]) => {
            const student = studentMap.get(studentId);
            if (!student) return;

            const {tasks} = usage;

            // 规则: 负载限制 (> 2)
            // 特殊豁免: 如果任务数为3，且其中包含至少2个眼操任务，则允许 (视为轻负载)
            const eyeExerciseCount = tasks.filter(t => t.task.category === TaskCategory.EYE_EXERCISE).length;
            const isEyeOverloadException = tasks.length === 3 && eyeExerciseCount >= 2;

            if (tasks.length > 2 && !isEyeOverloadException) {
                tasks.forEach(t => {
                    conflicts.push({
                        taskId: t.id,
                        groupId,
                        studentId,
                        reason: `任务过多 (${tasks.length})`,
                        type: 'error'
                    });
                });
            }

            // 规则: 时间段冲突
            const timeSlotCounts = new Map<TimeSlot, string[]>();
            tasks.forEach(t => {
                // 特殊规则: 室内课间操 (1-5楼) 视为无时间冲突 (可由同一人兼任)
                // 如果是室内课间操，跳过时间冲突检查
                if (t.task.category === TaskCategory.INTERVAL_EXERCISE && t.task.subCategory === '室内') {
                    return;
                }

                const slot = t.task.timeSlot;
                if (!timeSlotCounts.has(slot)) timeSlotCounts.set(slot, []);
                timeSlotCounts.get(slot)!.push(t.id);
            });

            timeSlotCounts.forEach((taskIds, slot) => {
                if (taskIds.length > 1) {
                    taskIds.forEach(tid => {
                        conflicts.push({
                            taskId: tid,
                            groupId,
                            studentId,
                            reason: `时间冲突 (${slot})`,
                            type: 'error'
                        });
                    });
                }
            });

            // 规则: 任务组合 (早晚互斥)
            const hasCleaning = tasks.some(t => t.task.category === TaskCategory.CLEANING);
            const hasEvening = tasks.some(t => t.task.category === TaskCategory.EVENING_STUDY);

            if (hasCleaning && hasEvening) {
                tasks.filter(t => t.task.category === TaskCategory.CLEANING || t.task.category === TaskCategory.EVENING_STUDY)
                    .forEach(t => {
                        conflicts.push({
                            taskId: t.id,
                            groupId,
                            studentId,
                            reason: '早晚班互斥',
                            type: 'error'
                        });
                    });
            }

            // 规则: 单任务约束 (部门、避嫌)
            tasks.forEach(t => {
                const validation = canAssign(student, t.task);
                if (!validation.valid) {
                    conflicts.push({
                        taskId: t.id,
                        groupId,
                        studentId,
                        reason: validation.reason || '不符合要求',
                        type: 'error'
                    });
                }
            });
        });
    });

    return conflicts;
};

export const getSuggestions = (
    students: Student[],
    conflicts: ConflictInfo[],
    assignments: Record<string, string>
): SuggestionInfo[] => {
    const suggestions: SuggestionInfo[] = [];

    conflicts.forEach(conflict => {
        if (conflict.type === 'warning') return;
        if (conflict.taskId === 'time-conflict') {
            suggestions.push({
                conflict,
                suggestedReason: '请移除冲突的任务'
            });
            return;
        }

        const task = ALL_TASKS.find(t => t.id === conflict.taskId);
        if (!task) return;

        // 查找候选人: 必须符合任务要求，且在当前组无冲突，且未过载
        // 随机打乱学生列表以避免总是推荐同一个人
        const shuffled = [...students].sort(() => Math.random() - 0.5);

        const candidate = shuffled.find(s => {
            // 不能是当前冲突的学生自己
            if (s.id === conflict.studentId) return false;

            // 使用 checkGroupAvailability 检查所有动态约束
            const check = checkGroupAvailability(s, task, conflict.groupId, assignments);
            return check.valid;
        });

        if (candidate) {
            suggestions.push({
                conflict,
                suggestedStudentId: candidate.id,
                suggestedReason: `推荐替换为: ${candidate.name} (${candidate.department})`
            });
        } else {
            suggestions.push({
                conflict,
                suggestedReason: '未找到符合条件的替补人员'
            });
        }
    });

    return suggestions;
};
