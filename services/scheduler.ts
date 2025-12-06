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

    // 计算有效负载 (Effective Load)
    // 高一上午眼操合并: 如果同时负责两个高一班级，视为一个任务
    let effectiveLoad = assignedTaskIds.length;
    const g1EyeTasks = assignedTaskIds.map(tid => ALL_TASKS.find(t => t.id === tid)!)
        .filter(t => t && t.category === TaskCategory.EYE_EXERCISE && t.subCategory === '上午' && t.name.includes('高一'));
    
    // 如果已经分配了任务中包含高一两个班的眼操，减去一个负载
    // 注意: 这里简化判断，只要有 >=2 个高一眼操，就减 1 (目前高一只有2个班的任务 1-3 和 4-6)
    if (g1EyeTasks.length >= 2) {
        effectiveLoad -= 1;
    }

    // 如果当前要分配的任务是高一上午眼操，且已分配任务里也有高一上午眼操，那么添加这个任务不应增加有效负载
    // (即 1 -> 1, 实际上是 1+1=2 -> 1)
    // 但这里 effectiveLoad 是基于 assignedTaskIds 的。
    // 我们需要判断 "添加当前 task 后" 的有效负载。
    // 简单点：检查 assignedTaskIds.length >= 2 (原始逻辑)
    // 改为检查 effectiveLoad >= 2
    
    // 但是要注意，如果 current task 是 "第2个高一眼操"，那么添加它之后，总数+1，但有效负载不变。
    // 所以:
    // Case 1: Has 1 G1 Eye. Add G1 Eye. (Eff: 1 -> 1). Allowed.
    // Case 2: Has 1 G1 Eye. Add Cleaning. (Eff: 1 -> 2). Allowed.
    // Case 3: Has 2 G1 Eyes (Eff: 1). Add Cleaning. (Eff: 1 -> 2). Allowed.
    // Case 4: Has 1 G1 Eye + 1 Cleaning (Eff: 2). Add G1 Eye. (Eff: 2 -> 2). Allowed?
    //         New set: G1, Clean, G1 -> G1, G1, Clean -> Eff: 1 + 1 = 2. Allowed.

    // 所以我们需要预测添加后的有效负载
    let newEffectiveLoad = effectiveLoad;
    const isTaskG1Eye = task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一');
    
    if (isTaskG1Eye) {
        // 如果新任务是 G1 Eye
        // 检查已有任务里是否有 G1 Eye
        if (g1EyeTasks.length > 0) {
            // 已经有一个了，再加一个，变成两个。有效负载增加 0 (从 1 变 1)
            // (1个G1: load=1. 2个G1: load=1)
            // 所以 newEffectiveLoad = effectiveLoad (which is currently calculated based on assigned only)
            // Wait. 
            // If assigned has 1 G1 (load=1). Add G1. Result 2 G1 (load=1). Delta = 0.
            // So newEffectiveLoad = effectiveLoad.
            
            // If assigned has 1 G1 + 1 Other (load=2). Add G1. Result 2 G1 + 1 Other (load=2). Delta = 0.
            // So newEffectiveLoad = effectiveLoad.
        } else {
            // 没有 G1 Eye. 加一个. Load + 1.
            newEffectiveLoad += 1;
        }
    } else {
        // 新任务不是 G1 Eye. Load + 1.
        newEffectiveLoad += 1;
    }

    if (newEffectiveLoad > 2) {
        // 检查是否允许例外: 已有包干区(1) + 申请眼操(1) -> 允许 -> 2
        // 如果已经是2了，再加就是3，一般不允许
        // 除非: 现有任务是 眼操AM + 眼操PM (2) -> 再加? 不行


        // 如果是室内课间操，且已有任务全是室内课间操，允许负载更高
        // 室内课间操无视时间冲突，且通常由特殊部门负责，可能人少楼层多
        const isIndoorTask = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
        if (isIndoorTask) {
             const allIndoor = assignedTaskIds.every(tid => {
                 const t = ALL_TASKS.find(x => x.id === tid);
                 return t && t.category === TaskCategory.INTERVAL_EXERCISE && t.subCategory === '室内';
             });
             if (allIndoor && assignedTaskIds.length < 5) { // 最多允许5层楼
                  return {valid: true}; // 允许
              }
         }

         // 眼保健操合并 (高一上午)
         // 允许一人检查多个班级 (如 1-3班 + 4-6班)
         // 此时负载可能是 2 (仅眼操) 或 3 (眼操 + 包干区)
         if (task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一')) {
             if (assignedTaskIds.length < 4) {
                 return {valid: true};
             }
         }
 
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

            // 上午眼操同时检查高一两个班不视为时间冲突 (视为合并)
            const isTaskG1Eye = task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一');
            const isAssignedG1Eye = assignedTask.category === TaskCategory.EYE_EXERCISE && assignedTask.subCategory === '上午' && assignedTask.name.includes('高一');
            if (isTaskG1Eye && isAssignedG1Eye) continue; // 允许同时接两个高一眼操

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
                
                // 高一上午眼操合并豁免
                // 如果是高一上午眼操，我们用特殊标记来代替时间槽，从而避免冲突
                let slot = t.timeSlot;
                if (t.category === TaskCategory.EYE_EXERCISE && t.subCategory === '上午' && t.name.includes('高一')) {
                    slot = <TimeSlot>'EYE_AM_G1_MERGED'; // 将两个班的任务视为同一时间槽（但这里 set.add 会导致第二次也被添加？）
                    // 不，如果用同一个 slot 字符串， set.has 会返回 true，导致冲突。
                    // 这里的逻辑是：如果 t1 和 t2 都是 高一上午眼操，它们应该兼容。
                    // 原始逻辑：t1 (slot=A), t2 (slot=A) -> 冲突。
                    // 我们的逻辑：t1 (slot=G1_EYE), t2 (slot=G1_EYE) -> 不冲突。
                    // 如何实现？
                    // 我们可以只记录一次。
                    if (timeSlots.has(slot)) {
                        // 已经有了。如果是 G1_EYE，且之前那个也是 G1_EYE，则不算冲突？
                        // 但是 tasks 遍历时，我们不知道 set 里那个是不是 G1_EYE。
                        // 简单点：如果当前是 G1_EYE，且 set 里已经有 G1_EYE，则忽略。
                        // 否则，如果 set 里有冲突，加分。
                        return; // 已经记录过 G1_EYE 了，跳过，不报冲突
                    }
                }

                if (timeSlots.has(slot)) {
                    energy += 1500; // 时间冲突惩罚
                }
                timeSlots.add(slot);
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

                        // 严格限制 - 如果已经有晚自习，不能再加任务（晚自习通常比较重）
                        if (hasEvening) return false;

                        // 严格限制 - 如果已经有2个任务，且其中没有眼操，说明是 "包干+其他"，再加就是3个
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
    maxAttempts: number;
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
            const studentG1EyeCounts: Record<string, number> = {}; // 追踪高一上午眼操数量
            const studentNonEyeCounts: Record<string, number> = {}; // 追踪非眼操数量
            const groupStudents = studentsPerGroup[g];

            groupStudents.forEach(s => {
                groupWorkload[s.id] = 0;
                studentCategories[s.id] = new Set();
                studentTimeSlots[s.id] = new Set();
                studentG1EyeCounts[s.id] = 0;
                studentNonEyeCounts[s.id] = 0;
            });

            ALL_TASKS.forEach(task => {
                const key = `${task.id}::${g}`;
                const sid = newAssignments[key];
                if (sid) {
                    if (groupWorkload[sid] !== undefined) {
                        groupWorkload[sid] = (groupWorkload[sid] || 0) + 1;
                        studentCategories[sid].add(task.category);
                        studentTimeSlots[sid].add(task.timeSlot);
                        
                        if (task.category === TaskCategory.EYE_EXERCISE) {
                            if (task.subCategory === '上午' && task.name.includes('高一')) {
                                studentG1EyeCounts[sid] = (studentG1EyeCounts[sid] || 0) + 1;
                            }
                        } else {
                            studentNonEyeCounts[sid] = (studentNonEyeCounts[sid] || 0) + 1;
                        }
                    }
                }
            });

            for (const task of sortedTasks) {
                const key = `${task.id}::${g}`;
                if (newAssignments[key]) continue;

                let candidates = groupStudents.filter(student => {
                    // 计算有效负载: 高一上午眼操2个算1个
                    let effectiveLoad = groupWorkload[student.id];
                    if (studentG1EyeCounts[student.id] >= 2) {
                        effectiveLoad -= 1;
                    }

                    // 预测新任务带来的负载变化
                    let loadIncrement = 1;
                    if (task.category === TaskCategory.EYE_EXERCISE && 
                        task.subCategory === '上午' && 
                        task.name.includes('高一') && 
                        studentG1EyeCounts[student.id] >= 1) {
                        // 已经有一个高一上午眼操，再加一个，有效负载不变 (1->1)
                        // 注意：如果已经有2个了(不应该发生)，也不变
                        // 简单判断：只要有至少1个，新加的这个就会合并，增量为0
                        loadIncrement = 0;
                    }
                    
                    const futureEffectiveLoad = effectiveLoad + loadIncrement;
                    const futureNonEyeCount = studentNonEyeCounts[student.id] + (task.category !== TaskCategory.EYE_EXERCISE ? 1 : 0);

                    // 允许有效负载达到 3，但必须满足：非眼操任务最多 1 个
                    // 也就是说，(2 Eye + 1 NonEye) 或 (3 Eye) 是允许的
                    // 但 (1 Eye + 2 NonEye) 是不允许的
                    if (futureEffectiveLoad > 3) return false;
                    if (futureEffectiveLoad === 3) {
                         if (futureNonEyeCount > 1) return false;
                    }
                    // 如果 futureEffectiveLoad <= 2，总是允许 (除非其他互斥规则)

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

                // 强力重试 - 允许时间冲突 (合并眼操 - 高一上午)
                // 如果找不到人，允许已经有眼操任务的人再接一个 (即合并 1-3 和 4-6)
                if (candidates.length === 0 && task.category === TaskCategory.EYE_EXERCISE && 
                    task.subCategory === '上午' && task.name.includes('高一')) {
                    
                    candidates = groupStudents.filter(student => {
                        // 1. 避嫌 (必须)
                        if (!canAssign(student, task).valid) return false;
                        
                        // 2. 负载检查 (允许到 3 或 4)
                        if (groupWorkload[student.id] >= 4) return false;

                        // 3. 时间冲突豁免
                        // 只要他在 EYE_AM 忙碌，我们假设他是因为做眼操忙碌。
                        // 我们只关心避嫌通过且负载未满。
                        
                        // 必须确保他已经有眼操任务？ (优先合并)
                        // 或者是完全空闲的人 (但之前应该被选了)
                        // 或者是因为负载=2而被之前逻辑排除的人 (比如有包干区 + 眼操)
                        // 这里我们放宽限制。
                        
                        return true;
                    });

                    // 排序：优先给已经有眼操任务的人 (实现合并，而不是给做包干区的人)
                    candidates.sort((a, b) => {
                        const hasA = studentCategories[a.id].has(TaskCategory.EYE_EXERCISE) ? 1 : 0;
                        const hasB = studentCategories[b.id].has(TaskCategory.EYE_EXERCISE) ? 1 : 0;
                        if (hasA !== hasB) return hasB - hasA; // 有眼操优先
                        
                        return groupWorkload[a.id] - groupWorkload[b.id]; // 负载小的优先
                    });
                }

                // 如果是室内课间操，且没找到人，允许一人多楼层 (负载 < 5)
                if (candidates.length === 0 && task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内') {
                    candidates = groupStudents.filter(student => {
                        // 允许负载更高，但仅限同类任务叠加
                        if (groupWorkload[student.id] >= 5) return false;
                        if (!canAssign(student, task).valid) return false; // 部门检查等

                        // 确保没有非室内课间操的任务（因为室内课间操通常由特殊部门全职负责，但也可能有其他兼职？）
                        // 实际上，特殊部门只负责室内课间操。
                        // 检查是否全是室内课间操
                        const allIndoor = [...studentCategories[student.id]].every(c => c === TaskCategory.INTERVAL_EXERCISE);
                        // 或者简单点，只要是特殊部门成员就可以
                        if (!allIndoor) return false;

                        return true;
                    });
                }

                // 高一上午眼保健操 - 默认尝试合并
                // 即使能找到空闲的人，也优先把 1-3 和 4-6 捆绑给同一个人
                if (task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一')) {
                     // 检查是否有人已经有另一半任务
                     const otherHalf = task.name.includes('1-3') ? '4-6' : '1-3';
                     // 查找已经持有 otherHalf 的人
                     const holder = groupStudents.find(s => {
                         // 检查该学生是否已分配了包含 otherHalf 的任务
                         // 注意：这里需要遍历 newAssignments
                         // 效率较低，但人数不多
                         return ALL_TASKS.some(t => {
                             if (t.category !== TaskCategory.EYE_EXERCISE || t.subCategory !== '上午' || !t.name.includes('高一')) return false;
                             if (!t.name.includes(otherHalf)) return false;
                             return newAssignments[`${t.id}::${g}`] === s.id;
                         });
                     });

                     if (holder) {
                         // 如果找到了持有者，且他不在 candidates 里（可能因为 load=2 被过滤了？）
                         // 如果他已经在 candidates 里，排序会处理。
                         // 如果他被过滤了（比如 load=2），我们需要在此处特许他加入吗？
                         // 是的，用户希望默认合并。
                         // 检查是否可以特许：
                         const canAdd = groupWorkload[holder.id] < 4 && canAssign(holder, task).valid;
                         if (canAdd && !candidates.some(c => c.id === holder.id)) {
                             candidates.push(holder);
                         }
                     }
                }

                if (candidates.length === 0) continue;

                candidates.sort((a, b) => {
                    // 计算有效负载 (Effective Load)
                    // 如果同时负责高一上午眼操的两个班 (1-3 和 4-6)，视为 1 个负载
                    const getEffectiveLoad = (sid: string, rawLoad: number) => {
                        let eff = rawLoad;
                        if (studentG1EyeCounts[sid] >= 2) {
                            eff -= 1;
                        }
                        return eff;
                    };

                    const loadA = getEffectiveLoad(a.id, groupWorkload[a.id]);
                    const loadB = getEffectiveLoad(b.id, groupWorkload[b.id]);

                    // 高一上午眼保健操 - 强力合并偏好
                    // 只要有一方已经持有另一半任务，无视负载差异，绝对优先
                    if (task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一')) {
                         const hasOtherHalf = (sid: string) => {
                             const otherHalf = task.name.includes('1-3') ? '4-6' : '1-3';
                             return ALL_TASKS.some(t => {
                                 if (t.category !== TaskCategory.EYE_EXERCISE || t.subCategory !== '上午' || !t.name.includes('高一')) return false;
                                 if (!t.name.includes(otherHalf)) return false;
                                 return newAssignments[`${t.id}::${g}`] === sid;
                             });
                         };
                         const hasA = hasOtherHalf(a.id);
                         const hasB = hasOtherHalf(b.id);
                         if (hasA && !hasB) return -1;
                         if (!hasA && hasB) return 1;
                    }
                    
                    // 1. 负载均衡 (使用有效负载)
                    if (loadA !== loadB) return loadA - loadB;

                    // 2. 年级偏好 (User Request)
                    // 优先让高三检查课间操室外和晚自习
                    if ((task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室外') || 
                        task.category === TaskCategory.EVENING_STUDY) {
                        // 高三优先
                        if (a.grade === 3 && b.grade !== 3) return -1;
                        if (b.grade === 3 && a.grade !== 3) return 1;
                        // 其次高二
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                    }

                    // 高二检查包干区，非必要不要让高三检查包干区
                    if (task.category === TaskCategory.CLEANING) {
                        // 高二优先
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                        
                        // 避免高三 (即 高一 > 高三)
                        // 如果都不是高二 (e.g. 1 vs 3)
                        if (a.grade !== 3 && b.grade === 3) return -1; // a(1) 优于 b(3)
                        if (b.grade !== 3 && a.grade === 3) return 1;
                    }
                    
                    // 3. 眼操偏好: 已经有包干区的人优先 (凑单?) - 旧逻辑
                    if (task.category === TaskCategory.EYE_EXERCISE) {
                        const hasCleanA = studentCategories[a.id].has(TaskCategory.CLEANING);
                        const hasCleanB = studentCategories[b.id].has(TaskCategory.CLEANING);
                        if (hasCleanA && !hasCleanB) return -1;
                        if (!hasCleanA && hasCleanB) return 1;
                    }

                    // 4. 室内课间操偏好: 优先分配给已经负责了相邻楼层的人 (减少移动)
                    // 注意: 这里假设楼层体现在 task.name 中，如 "一楼", "二楼"
                    if (task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内') {
                        const getAssignedFloors = (sid: string) => {
                            const floors: number[] = [];
                            // 遍历当前新分配中该学生的所有任务
                            ALL_TASKS.forEach(t => {
                                const k = `${t.id}::${g}`;
                                if (newAssignments[k] === sid && t.category === TaskCategory.INTERVAL_EXERCISE && t.subCategory === '室内') {
                                    // 从名字提取楼层: "一楼" -> 1
                                    const map: Record<string, number> = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5};
                                    const floorChar = t.name.charAt(0);
                                    if (map[floorChar]) floors.push(map[floorChar]);
                                }
                            });
                            return floors;
                        };

                        // 当前任务的目标楼层
                        const map: Record<string, number> = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5};
                        const targetFloor = map[task.name.charAt(0)] || 0;

                        if (targetFloor > 0) {
                            const floorsA = getAssignedFloors(a.id);
                            const floorsB = getAssignedFloors(b.id);

                            // 计算最小楼层距离 (越小越好)
                            const getMinDist = (floors: number[]) => {
                                if (floors.length === 0) return Infinity; // 没有分配过楼层，优先级最低(或者视为中性)
                                return Math.min(...floors.map(f => Math.abs(f - targetFloor)));
                            };

                            const distA = getMinDist(floorsA);
                            const distB = getMinDist(floorsB);

                            if (distA !== distB) {
                                // 修正: Infinity (没任务) 应该比 任意数字 (有任务) 优先级更低吗？
                                // 不，前面已经按 load 排序了。如果 load 相同，说明两人任务数相同。
                                // 如果 floorsA 为空，说明这 1 个任务不是室内课间操? (因为我们只过滤了室内)
                                // 或者说，loadA=1, 但 floorsA=[]，说明他有一个非室内任务。
                                // 此时 distA = Infinity。
                                // 而 B 有一个室内任务，distB = 1。
                                // 我们应该优先给 B (凑成相邻) 还是给 A (虽然有任务但不是室内的)?
                                // 如果给 B，B 就有 2 个室内任务了。
                                // 如果给 A，A 就有 1 个室内 + 1 个非室内。
                                // 显然，为了 "同类聚集"，应该优先给 B。
                                // 所以 dist 小的优先是正确的 (1 < Infinity)。

                                return distA - distB;
                            }
                        }
                    }

                    return Math.random() - 0.5;
                });

                const bestCandidate = candidates[0];
                newAssignments[key] = bestCandidate.id;
                groupWorkload[bestCandidate.id]++;
                studentCategories[bestCandidate.id].add(task.category);
                studentTimeSlots[bestCandidate.id].add(task.timeSlot);

                if (task.category === TaskCategory.EYE_EXERCISE) {
                    if (task.subCategory === '上午' && task.name.includes('高一')) {
                        studentG1EyeCounts[bestCandidate.id]++;
                    }
                } else {
                    studentNonEyeCounts[bestCandidate.id]++;
                }
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
            const nonEyeCount = tasks.length - eyeExerciseCount;
            // 如果任务数为4，但其中包含高一上午眼操合并(2个) + 下午眼操(1个) + 包干(1个)，则允许。
            // 实际上，只要非眼操任务 <= 1，且总任务数 <= 4 (考虑到高一合并占2个)，或者总有效任务数 <= 3
            // 简单点：允许 1个非眼操 + 任意数量眼操(只要时间不冲突)？不，还是限制一下。
            // 目前允许:
            // 1. (Length <= 2)
            // 2. (Length == 3 && Eye >= 2) -> (1 NonEye + 2 Eye) or (3 Eye)
            // 3. (Length == 4 && Eye >= 3 && G1MergeExists) -> (1 NonEye + 3 Eye(Effective 2) = Effective 3)
            
            // 让我们计算有效负载
            let effectiveCount = tasks.length;
            const g1EyeTasks = tasks.filter(t => t.task.category === TaskCategory.EYE_EXERCISE && t.task.subCategory === '上午' && t.task.name.includes('高一'));
            if (g1EyeTasks.length >= 2) effectiveCount -= 1;
            
            // 判定逻辑:
            // 1. Effective <= 2: OK
            // 2. Effective == 3: OK IF NonEye <= 1
            // 3. Effective > 3: NO
            
            const isValidLoad = effectiveCount <= 2 || (effectiveCount === 3 && nonEyeCount <= 1);

            if (!isValidLoad) {
                tasks.forEach(t => {
                    conflicts.push({
                        taskId: t.id,
                        groupId,
                        studentId,
                        reason: `任务过多 (Eff:${effectiveCount}, Raw:${tasks.length})`,
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
                    // 高一上午眼操合并豁免
                    if (slot === TimeSlot.EYE_AM) {
                        const allTasksAreG1Eye = taskIds.every(tid => {
                            const t = ALL_TASKS.find(x => x.id === tid);
                            return t && t.category === TaskCategory.EYE_EXERCISE && t.subCategory === '上午' && t.name.includes('高一');
                        });
                        // 如果冲突的任务全部是高一上午眼操，则视为合并，不报错
                        if (allTasksAreG1Eye) return;
                    }

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
