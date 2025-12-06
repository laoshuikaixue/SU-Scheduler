import {Student, TaskCategory, TaskDefinition, TimeSlot, Department} from '../types';
import {ALL_TASKS, SPECIAL_DEPARTMENTS} from '../constants';

export interface SchedulerOptions {
    enableTemporaryMode?: boolean;
}

// 检查学生是否符合任务的基础硬性要求（部门、年级、避嫌）
export const canAssign = (student: Student, task: TaskDefinition, options?: SchedulerOptions): { valid: boolean; reason?: string } => {
    // 1. 部门职责检查
    if (!task.allowedDepartments.includes(student.department)) {
        // 临时模式：允许主席团检查包干区
        let isAllowedException = false;

        if (options?.enableTemporaryMode && 
            task.category === TaskCategory.CLEANING) {
                
                // 允许 主席团、纪检部、学习部
                if ([Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY].includes(student.department)) {
                    // 区分角色：主席不参与，副主席参与
                    if (student.department === Department.CHAIRMAN && student.role === '主席') {
                        return {valid: false, reason: '主席不参与包干区'};
                    }
                    isAllowedException = true;
                }
        }
            
        if (!isAllowedException) {
            return {valid: false, reason: '部门职责不符'};
        }
    }

    // 2. 眼操班级组冲突检查（避嫌）
    if (task.forbiddenClassGroup) {
        if (
            student.grade === task.forbiddenClassGroup.grade &&
            student.classNum >= task.forbiddenClassGroup.minClass &&
            student.classNum <= task.forbiddenClassGroup.maxClass
        ) {
            return {valid: false, reason: '需避嫌(本班所在组)'};
        }
    }

    // 3. 包干区任务仅限高二学生
    if (task.category === TaskCategory.CLEANING) {
        if (student.grade !== 2) {
            return {valid: false, reason: '包干区仅限高二'};
        }
    }

    // 4. 上午眼保健操高三不参与检查
    if (task.timeSlot === TimeSlot.EYE_AM && student.grade === 3) {
        return {valid: false, reason: '高三不参与该项检查'};
    }

    // 5. 晚自习年级冲突检查（避嫌）
    if (task.forbiddenGrade && student.grade === task.forbiddenGrade) {
        return {valid: false, reason: '需避嫌(本年级)'};
    }

    return {valid: true};
};

// 检查学生是否已经在该组被过度分配或有冲突
export const checkGroupAvailability = (
    student: Student,
    task: TaskDefinition,
    groupId: number,
    currentAssignments: Record<string, string>, // 键: taskId::groupId
    conflicts: ConflictInfo[] = [],
    options?: SchedulerOptions
): { valid: boolean; reason?: string } => {
    // 1. 基础资格检查
    const basicCheck = canAssign(student, task, options);
    if (!basicCheck.valid) return basicCheck;

    // 2. 收集该学生在当前组已分配的任务，并检查跨组冲突
    const assignedTaskIds: string[] = [];
    let otherGroupAssignment: number | undefined;

    Object.entries(currentAssignments).forEach(([key, sid]) => {
        if (sid !== student.id) return;
        const [tid, gStr] = key.split('::');
        const gId = parseInt(gStr);

        if (gId === groupId) {
            // 排除当前正在判断的任务本身
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
    // 计算有效负载：高一上午眼操同时负责两个班级时，视为一个任务负载
    let effectiveLoad = assignedTaskIds.length;
    const g1EyeTasks = assignedTaskIds.map(tid => ALL_TASKS.find(t => t.id === tid)!)
        .filter(t => t && t.category === TaskCategory.EYE_EXERCISE && t.subCategory === '上午' && t.name.includes('高一'));
    
    if (g1EyeTasks.length >= 2) {
        effectiveLoad -= 1;
    }

    // 预测添加新任务后的有效负载
    let newEffectiveLoad = effectiveLoad;
    const isTaskG1Eye = task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一');
    
    if (isTaskG1Eye) {
        // 如果已有高一眼操，再添加一个同类任务不增加有效负载（合并）
        if (g1EyeTasks.length === 0) {
            newEffectiveLoad += 1;
        }
    } else {
        newEffectiveLoad += 1;
    }

    if (newEffectiveLoad > 2) {
        // 例外情况检查
        // 0. 临时模式：主席团/纪检/学习部 忽略负载限制以填满包干区
        const isTargetDeptExempt = options?.enableTemporaryMode && 
            task.category === TaskCategory.CLEANING &&
            [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY].includes(student.department);

        if (isTargetDeptExempt) {
            // 即使是豁免部门，如果同时有晚自习，还是不允许（物理互斥）
            // 但负载限制本身忽略
        } else {
            // 1. 室内课间操：允许负载更高（<= 5），前提是任务全为室内课间操
            const isIndoorTask = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
            let isIndoorValid = false;
            if (isIndoorTask) {
                const allIndoor = assignedTaskIds.every(tid => {
                    const t = ALL_TASKS.find(x => x.id === tid);
                    return t && t.category === TaskCategory.INTERVAL_EXERCISE && t.subCategory === '室内';
                });
                if (allIndoor && assignedTaskIds.length < 5) {
                    isIndoorValid = true;
                }
            }

            // 2. 眼保健操合并 (高一上午)：允许一人检查多个班级
            let isEyeValid = false;
            if (task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一')) {
                if (assignedTaskIds.length < 4) {
                    isEyeValid = true;
                }
            }
    
            if (!isIndoorValid && !isEyeValid) {
                return {valid: false, reason: '负载已满'};
            }
        }
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
            if (isTaskG1Eye && isAssignedG1Eye) continue;

            if (assignedTask.timeSlot === task.timeSlot) {
                return {valid: false, reason: `时间冲突 (${task.timeSlot})`};
            }
        }
    }

    return {valid: true};
}

// 将学生均匀分配到各组，优先保留锁定分配，并确保特殊部门均匀分布
const distributeStudentsToGroups = (
    students: Student[],
    numGroups: number,
    lockedAssignments: Map<string, Set<number>>
): Student[][] => {
    const groups: Student[][] = Array.from({length: numGroups}, () => []);

    // 1. 处理已锁定（手动分配）的学生
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

    // 2.1 优先分配组长
    const leaders = availableStudents.filter(s => s.isLeader);
    const nonLeaders = availableStudents.filter(s => !s.isLeader);

    // 计算各组已有的组长数量
    const groupLeaderCounts = groups.map(g => g.filter(s => s.isLeader).length);

    leaders.forEach(leader => {
        // 找到组长最少的组
        let minCount = Infinity;
        let targetGroupIndices: number[] = [];

        groupLeaderCounts.forEach((count, idx) => {
            if (count < minCount) {
                minCount = count;
                targetGroupIndices = [idx];
            } else if (count === minCount) {
                targetGroupIndices.push(idx);
            }
        });

        // 随机选择一个目标组
        const targetGroupIndex = targetGroupIndices[Math.floor(Math.random() * targetGroupIndices.length)];
        
        groups[targetGroupIndex].push(leader);
        groupLeaderCounts[targetGroupIndex]++;
    });

    // 3. 打乱剩余未分配学生
    const shuffledStudents = [...nonLeaders].sort(() => Math.random() - 0.5);

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

    // 4. 特殊部门分配 (均匀分配)
    let groupOffset = Math.floor(Math.random() * numGroups);

    specialStudents.forEach((s, idx) => {
        groups[(idx + groupOffset) % numGroups].push(s);
    });

    // 5. 常规部门分配 (按年级+部门细分后轮询分配)
    const bucketMap: Record<string, Student[]> = {};
    regularStudents.forEach(s => {
        const key = `${s.department}-${s.grade}`;
        if (!bucketMap[key]) bucketMap[key] = [];
        bucketMap[key].push(s);
    });

    groupOffset = (groupOffset + 1) % numGroups;

    Object.values(bucketMap).forEach(bucketStudents => {
        bucketStudents.forEach((s, idx) => {
            groups[(idx + groupOffset) % numGroups].push(s);
        });
        groupOffset = (groupOffset + 1) % numGroups;
    });

    return groups;
};

// --- 模拟退火支持 ---

// 计算当前分配方案的能量值（越低越好），用于评估方案质量
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

    const groupUsage: Record<number, Record<string, TaskDefinition[]>> = {};
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

    // 2. 跨组冲突惩罚 (权重 5000)
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
                let slot = t.timeSlot;
                if (t.category === TaskCategory.EYE_EXERCISE && t.subCategory === '上午' && t.name.includes('高一')) {
                    slot = <TimeSlot>'EYE_AM_G1_MERGED';
                    // 如果已存在该合并槽位，不再重复记录（视为合并）
                    if (timeSlots.has(slot)) return;
                }

                if (timeSlots.has(slot)) {
                    energy += 1500; // 时间冲突惩罚
                }
                timeSlots.add(slot);
            });
        });
    });

    // 4. 负载方差 (权重 10) - 优化目标
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

    // 1. 填充未分配的任务 (随机分配给符合硬性约束的人，用于初始化SA解空间)
    const studentMap = new Map(students.map(s => [s.id, s]));

    const studentsByGroup: Student[][] = Array.from({length: numGroups}, () => []);
    
    // 推断学生所属组
    const studentGroupMap = new Map<string, number>();
    Object.entries(currentAssignments).forEach(([key, sid]) => {
        const [_, gStr] = key.split('::');
        studentGroupMap.set(sid, parseInt(gStr));
    });

    students.forEach(s => {
        if (!studentGroupMap.has(s.id)) {
            // 随机分配未任务学生到组
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
        const newAssignments = {...currentAssignments};
        const taskKeys = Object.keys(newAssignments);
        if (taskKeys.length === 0) break;

        // 随机变异：选择一个任务重新分配给组内其他候选人
        const randomKey = taskKeys[Math.floor(Math.random() * taskKeys.length)];
        const [taskId, gStr] = randomKey.split('::');
        const groupId = parseInt(gStr);
        const task = ALL_TASKS.find(t => t.id === taskId);

        if (task) {
            const groupStudents = studentsByGroup[groupId];
            const candidates = groupStudents.filter(s => canAssign(s, task).valid);

            if (candidates.length > 0) {
                const newStudent = candidates[Math.floor(Math.random() * candidates.length)];
                newAssignments[randomKey] = newStudent.id;

                // 计算能量差
                const newEnergy = calculateEnergy(newAssignments, students, numGroups);
                const delta = newEnergy - currentEnergy;

                // Metropolis 准则
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
    numGroups: number,
    options?: SchedulerOptions
): Record<string, string> => {
    let bestAssignments: Record<string, string> = {};
    let maxFilledCount = -1;
    let minLoadVariance = Infinity; // 追踪负载方差，越小越均衡
    const totalSlots = ALL_TASKS.length * numGroups;
    const MAX_RETRIES = 100;

    // 预处理锁定信息
    const lockedAssignments = new Map<string, Set<number>>();
    Object.entries(currentAssignments).forEach(([key, sId]) => {
        const [_, gStr] = key.split('::');
        const gId = parseInt(gStr);
        if (!lockedAssignments.has(sId)) lockedAssignments.set(sId, new Set());
        lockedAssignments.get(sId)!.add(gId);
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const newAssignments = {...currentAssignments};

        // 将学生分配到各组
        const studentsPerGroup = distributeStudentsToGroups(students, numGroups, lockedAssignments);

        // 追踪学生实际分配到的组 (用于跨组借调时的互斥检查)
        const studentGroupMap = new Map<string, number>();
        Object.entries(newAssignments).forEach(([key, sid]) => {
            const [_, gStr] = key.split('::');
            studentGroupMap.set(sid, parseInt(gStr));
        });

        // 任务排序：优先处理约束多的任务
        const sortedTasks = [...ALL_TASKS].sort((a, b) => {
            // 0. 临时模式：包干区最优先
            if (options?.enableTemporaryMode) {
                 const isCleanA = a.category === TaskCategory.CLEANING;
                 const isCleanB = b.category === TaskCategory.CLEANING;
                 if (isCleanA && !isCleanB) return -1;
                 if (!isCleanA && isCleanB) return 1;
            }

            // 1. 部门限制少的优先
            const deptDiff = a.allowedDepartments.length - b.allowedDepartments.length;
            if (deptDiff !== 0) return deptDiff;

            // 2. 硬性约束 (晚自习)
            if (a.forbiddenGrade && !b.forbiddenGrade) return -1;
            if (!a.forbiddenGrade && b.forbiddenGrade) return 1;

            return 0;
        });

        // 逐组编排
        for (let g = 0; g < numGroups; g++) {
            const groupWorkload: Record<string, number> = {};
            const studentCategories: Record<string, Set<TaskCategory>> = {};
            const studentTimeSlots: Record<string, Set<TimeSlot>> = {};

            const groupStudents = studentsPerGroup[g];

            // 初始化追踪器
            groupStudents.forEach(s => {
                groupWorkload[s.id] = 0;
                studentCategories[s.id] = new Set();
                studentTimeSlots[s.id] = new Set();
            });

            // 扫描手动锁定的分配
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

                // 候选人筛选
                let candidates = groupStudents.filter(student => {
                    // 检查是否已被分配到其他组 (全局互斥)
                    if (studentGroupMap.has(student.id) && studentGroupMap.get(student.id) !== g) return false;

                    // 0. 临时模式豁免
                    if (options?.enableTemporaryMode && 
                        task.category === TaskCategory.CLEANING && 
                        [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY].includes(student.department)) {
                        
                        if (!canAssign(student, task, options).valid) return false;
                        
                        const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                        const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);
                        
                        if (task.category === TaskCategory.CLEANING && hasCleaning) return false;
                        if (task.category === TaskCategory.EVENING_STUDY && hasEvening) return false; // 仍保留早晚互斥
                        if (task.category === TaskCategory.CLEANING && hasEvening) return false;

                        return true; // 忽略负载、时间冲突
                    }

                    // 1. 负载限制 (基础 <= 2)
                    if (groupWorkload[student.id] >= 2) return false;

                    // 2. 时间冲突 (室内课间操除外)
                    const isIndoorInterval = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
                    if (!isIndoorInterval && studentTimeSlots[student.id].has(task.timeSlot)) return false;

                    // 3. 任务特定约束
                    if (!canAssign(student, task, options).valid) return false;

                    // 4. 互斥逻辑
                    const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                    const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);

                    if (task.category === TaskCategory.EVENING_STUDY && hasCleaning) return false;
                    if (task.category === TaskCategory.CLEANING && hasEvening) return false;
                    if (task.category === TaskCategory.CLEANING && hasCleaning) return false;
                    if (task.category === TaskCategory.EVENING_STUDY && hasEvening) return false;

                    return true;
                });

                // 如果没找到，尝试放宽负载限制（针对眼操）
                if (candidates.length === 0 && task.category === TaskCategory.EYE_EXERCISE) {
                    candidates = groupStudents.filter(student => {
                        // 放宽负载限制: 允许 > 2，前提是已有包干区等情况，但必须保证至少有一个眼操
                        if (studentTimeSlots[student.id].has(task.timeSlot)) return false;
                        if (!canAssign(student, task).valid) return false;

                        const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                        const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);

                        if (hasCleaning && hasEvening) return false;
                        if (hasEvening) return false; // 晚自习较重，不再增加

                        // 确保是 "包干+眼操" 的组合，避免三个大任务
                        if (groupWorkload[student.id] === 2 && !studentCategories[student.id].has(TaskCategory.EYE_EXERCISE)) {
                            return false;
                        }

                        if (groupWorkload[student.id] >= 3) return false;

                        return true;
                    });
                }

                // 尝试跨组借调 (临时模式 + 包干区)
                if (candidates.length === 0 && 
                    options?.enableTemporaryMode && 
                    task.category === TaskCategory.CLEANING) {
                    
                    const targetDepts = [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY];
                    // 在所有学生中寻找完全空闲的目标部门人员
                    const borrowed = students.filter(s => {
                        if (!targetDepts.includes(s.department)) return false;
                        if (studentGroupMap.has(s.id)) return false; // 必须未分配任何组/任务
                        
                        // 检查基础资格
                        if (!canAssign(s, task, options).valid) return false;
                        
                        return true;
                    });
                    
                    if (borrowed.length > 0) {
                        candidates = borrowed;
                    }
                }

                if (candidates.length === 0) continue;

                // 候选人优先级排序
                candidates.sort((a, b) => {
                    const loadA = groupWorkload[a.id];
                    const loadB = groupWorkload[b.id];

                    // 1. 优先负载最低
                    if (loadA !== loadB) return loadA - loadB;

                    // 2. 包干区偏好: 高二 > 高三 > 高一
                    if (task.category === TaskCategory.CLEANING) {
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                        if (a.grade === 3 && b.grade !== 3) return -1;
                        if (b.grade === 3 && a.grade !== 3) return 1;
                    }

                    // 3. 眼操偏好: 优先给已有包干区的人 (凑成组合)
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
                studentGroupMap.set(bestCandidate.id, g);

                // 初始化借调人员的追踪器
                if (groupWorkload[bestCandidate.id] === undefined) {
                    groupWorkload[bestCandidate.id] = 0;
                    studentCategories[bestCandidate.id] = new Set();
                    studentTimeSlots[bestCandidate.id] = new Set();
                }

                groupWorkload[bestCandidate.id]++;
                studentCategories[bestCandidate.id].add(task.category);
                studentTimeSlots[bestCandidate.id].add(task.timeSlot);
            }
        }

        // 计算覆盖率和负载方差
        const filledCount = Object.keys(newAssignments).length;
        const studentTotalLoad: Record<string, number> = {};
        Object.values(newAssignments).forEach(sid => {
            studentTotalLoad[sid] = (studentTotalLoad[sid] || 0) + 1;
        });

        let currentLoadVariance = 0;
        Object.values(studentTotalLoad).forEach(load => {
            currentLoadVariance += load * load;
        });

        // 择优策略：优先覆盖率，其次低方差
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
    onProgress: (log: string, stats?: CalculationStats) => void,
    options?: SchedulerOptions
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
        await new Promise(resolve => setTimeout(resolve, 0));

        const newAssignments = {...currentAssignments};
        const studentsPerGroup = distributeStudentsToGroups(students, numGroups, lockedAssignments);

        // 追踪学生实际分配到的组 (用于跨组借调时的互斥检查)
        const studentGroupMap = new Map<string, number>();
        Object.entries(newAssignments).forEach(([key, sid]) => {
            const [_, gStr] = key.split('::');
            studentGroupMap.set(sid, parseInt(gStr));
        });

        const sortedTasks = [...ALL_TASKS].sort((a, b) => {
            // 0. 临时模式：包干区最优先
            if (options?.enableTemporaryMode) {
                 const isCleanA = a.category === TaskCategory.CLEANING;
                 const isCleanB = b.category === TaskCategory.CLEANING;
                 if (isCleanA && !isCleanB) return -1;
                 if (!isCleanA && isCleanB) return 1;
            }

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
                    // 检查是否已被分配到其他组 (全局互斥)
                    if (studentGroupMap.has(student.id) && studentGroupMap.get(student.id) !== g) return false;

                    // 0. 临时模式：强制分配优先人员 (主席团/纪检/学习)
                    if (options?.enableTemporaryMode) {
                        const targetDepts = [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY];
                        if (targetDepts.includes(student.department)) {
                             if (!canAssign(student, task, options).valid) return false;
                             
                             // 即使是临时模式，时间冲突(除非室内)和互斥仍需检查
                             const isIndoorInterval = task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内';
                             // 包干区任务允许时间冲突
                             const isExemptTime = task.category === TaskCategory.CLEANING;
                             if (!isIndoorInterval && !isExemptTime && studentTimeSlots[student.id].has(task.timeSlot)) return false;

                             const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                             const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);
                             
                             if (task.category === TaskCategory.EVENING_STUDY && hasCleaning) return false;
                             if (task.category === TaskCategory.CLEANING && hasEvening) return false;
                             
                             // 恢复一人一包干区限制
                             if (task.category === TaskCategory.CLEANING && hasCleaning) return false;
                             if (task.category === TaskCategory.EVENING_STUDY && hasEvening) return false;
                             
                             // 主席团/纪检/学习部特殊放宽：确保包干区能填满，忽略负载限制
                             if (targetDepts.includes(student.department) && task.category === TaskCategory.CLEANING) {
                                 return true; 
                             }

                             return true; // 忽略负载限制
                        }
                    }

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
                        loadIncrement = 0;
                    }
                    
                    const futureEffectiveLoad = effectiveLoad + loadIncrement;
                    const futureNonEyeCount = studentNonEyeCounts[student.id] + (task.category !== TaskCategory.EYE_EXERCISE ? 1 : 0);

                    // 允许有效负载达到 3，但必须满足：非眼操任务最多 1 个
                    if (futureEffectiveLoad > 3) return false;
                    if (futureEffectiveLoad === 3) {
                         if (futureNonEyeCount > 1) return false;
                    }

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
                        if (!canAssign(student, task, options).valid) return false;
                        const hasCleaning = studentCategories[student.id].has(TaskCategory.CLEANING);
                        const hasEvening = studentCategories[student.id].has(TaskCategory.EVENING_STUDY);
                        if (hasEvening) return false;
                        if (groupWorkload[student.id] === 2 && !studentCategories[student.id].has(TaskCategory.EYE_EXERCISE)) return false;
                        if (groupWorkload[student.id] >= 3) return false;
                        return true;
                    });
                }

                // 强力重试 - 允许合并高一上午眼操
                if (candidates.length === 0 && task.category === TaskCategory.EYE_EXERCISE && 
                    task.subCategory === '上午' && task.name.includes('高一')) {
                    
                    candidates = groupStudents.filter(student => {
                        if (!canAssign(student, task, options).valid) return false;
                        if (groupWorkload[student.id] >= 4) return false;
                        // 忽略时间冲突（视为合并）
                        return true;
                    });

                    // 优先给已有眼操任务的人
                    candidates.sort((a, b) => {
                        const hasA = studentCategories[a.id].has(TaskCategory.EYE_EXERCISE) ? 1 : 0;
                        const hasB = studentCategories[b.id].has(TaskCategory.EYE_EXERCISE) ? 1 : 0;
                        if (hasA !== hasB) return hasB - hasA;
                        return groupWorkload[a.id] - groupWorkload[b.id];
                    });
                }

                // 室内课间操特例：允许一人多层
                if (candidates.length === 0 && task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内') {
                    candidates = groupStudents.filter(student => {
                        if (groupWorkload[student.id] >= 5) return false;
                        if (!canAssign(student, task, options).valid) return false;
                        
                        // 仅限特殊部门或已负责室内任务的人
                        const allIndoor = [...studentCategories[student.id]].every(c => c === TaskCategory.INTERVAL_EXERCISE);
                        if (!allIndoor) return false;

                        return true;
                    });
                }

                // 高一上午眼保健操 - 默认尝试合并 (捆绑 1-3 和 4-6)
                if (task.category === TaskCategory.EYE_EXERCISE && task.subCategory === '上午' && task.name.includes('高一')) {
                     const otherHalf = task.name.includes('1-3') ? '4-6' : '1-3';
                     const holder = groupStudents.find(s => {
                         return ALL_TASKS.some(t => {
                             if (t.category !== TaskCategory.EYE_EXERCISE || t.subCategory !== '上午' || !t.name.includes('高一')) return false;
                             if (!t.name.includes(otherHalf)) return false;
                             return newAssignments[`${t.id}::${g}`] === s.id;
                         });
                     });

                     if (holder) {
                         const canAdd = groupWorkload[holder.id] < 4 && canAssign(holder, task, options).valid;
                         if (canAdd && !candidates.some(c => c.id === holder.id)) {
                             candidates.push(holder);
                         }
                     }
                }

                // 尝试跨组借调 (临时模式 + 包干区)
                if (candidates.length === 0 && 
                    options?.enableTemporaryMode && 
                    task.category === TaskCategory.CLEANING) {
                    
                    const targetDepts = [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY];
                    // 在所有学生中寻找完全空闲的目标部门人员
                    const borrowed = students.filter(s => {
                        if (!targetDepts.includes(s.department)) return false;
                        if (studentGroupMap.has(s.id)) return false; // 必须未分配任何组/任务
                        
                        // 检查基础资格
                        if (!canAssign(s, task, options).valid) return false;
                        
                        return true;
                    });
                    
                    if (borrowed.length > 0) {
                        candidates = borrowed;
                    }
                }

                if (candidates.length === 0) continue;

                candidates.sort((a, b) => {
                    // 0. 临时模式：优先保障目标人员 (主席团/纪检/学习) 至少有一个任务
                    if (options?.enableTemporaryMode) {
                        const targetDepts = [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY];
                        const isTargetA = targetDepts.includes(a.department);
                        const isTargetB = targetDepts.includes(b.department);
                        
                        const loadA = groupWorkload[a.id];
                        const loadB = groupWorkload[b.id];

                        // 优先填满包干区 (特别是主席团副主席)
                        if (task.category === TaskCategory.CLEANING) {
                             // 如果已经有包干区任务了，就不能再分配了（上面filter已经过滤了，这里是双重保险/排序逻辑）
                             // 修复 undefined 引用：确保 studentCategories[id] 存在
                             const hasCleanA = studentCategories[a.id] ? studentCategories[a.id].has(TaskCategory.CLEANING) : false;
                             const hasCleanB = studentCategories[b.id] ? studentCategories[b.id].has(TaskCategory.CLEANING) : false;
                             if (hasCleanA && !hasCleanB) return 1; // A已有，B优先
                             if (!hasCleanA && hasCleanB) return -1;

                             const isChairmanA = a.department === Department.CHAIRMAN && a.role !== '主席';
                             const isChairmanB = b.department === Department.CHAIRMAN && b.role !== '主席';
                             
                             // 副主席优先填坑
                             if (isChairmanA && !isChairmanB) return -1;
                             if (!isChairmanA && isChairmanB) return 1;
                        }

                        // 只要目标人员没有任务，就绝对优先于其他人(或已有任务的目标人员)
                        if (isTargetA && loadA === 0) {
                            if (!isTargetB || loadB > 0) return -1;
                        }
                        if (isTargetB && loadB === 0) {
                            if (!isTargetA || loadA > 0) return 1;
                        }
                    }

                    // 计算有效负载
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
                    
                    // 1. 负载均衡
                    if (loadA !== loadB) return loadA - loadB;

                    // 2. 年级偏好
                    // 优先让高三检查课间操室外和晚自习
                    if ((task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室外') || 
                        task.category === TaskCategory.EVENING_STUDY) {
                        if (a.grade === 3 && b.grade !== 3) return -1;
                        if (b.grade === 3 && a.grade !== 3) return 1;
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                    }

                    // 高二优先检查包干区
                    if (task.category === TaskCategory.CLEANING) {
                        if (a.grade === 2 && b.grade !== 2) return -1;
                        if (b.grade === 2 && a.grade !== 2) return 1;
                        if (a.grade !== 3 && b.grade === 3) return -1;
                        if (b.grade !== 3 && a.grade === 3) return 1;
                    }
                    
                    // 3. 眼操偏好
                    if (task.category === TaskCategory.EYE_EXERCISE) {
                        const hasCleanA = studentCategories[a.id].has(TaskCategory.CLEANING);
                        const hasCleanB = studentCategories[b.id].has(TaskCategory.CLEANING);
                        if (hasCleanA && !hasCleanB) return -1;
                        if (!hasCleanA && hasCleanB) return 1;
                    }

                    // 4. 室内课间操偏好: 优先分配给已经负责了相邻楼层的人
                    if (task.category === TaskCategory.INTERVAL_EXERCISE && task.subCategory === '室内') {
                        const getAssignedFloors = (sid: string) => {
                            const floors: number[] = [];
                            ALL_TASKS.forEach(t => {
                                const k = `${t.id}::${g}`;
                                if (newAssignments[k] === sid && t.category === TaskCategory.INTERVAL_EXERCISE && t.subCategory === '室内') {
                                    const map: Record<string, number> = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5};
                                    const floorChar = t.name.charAt(0);
                                    if (map[floorChar]) floors.push(map[floorChar]);
                                }
                            });
                            return floors;
                        };

                        const map: Record<string, number> = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5};
                        const targetFloor = map[task.name.charAt(0)] || 0;

                        if (targetFloor > 0) {
                            const floorsA = getAssignedFloors(a.id);
                            const floorsB = getAssignedFloors(b.id);

                            const getMinDist = (floors: number[]) => {
                                if (floors.length === 0) return Infinity;
                                return Math.min(...floors.map(f => Math.abs(f - targetFloor)));
                            };

                            const distA = getMinDist(floorsA);
                            const distB = getMinDist(floorsB);

                            if (distA !== distB) {
                                return distA - distB;
                            }
                        }
                    }

                    return Math.random() - 0.5;
                });

                const bestCandidate = candidates[0];
                newAssignments[key] = bestCandidate.id;
                studentGroupMap.set(bestCandidate.id, g);

                if (groupWorkload[bestCandidate.id] === undefined) {
                    groupWorkload[bestCandidate.id] = 0;
                    studentCategories[bestCandidate.id] = new Set();
                    studentTimeSlots[bestCandidate.id] = new Set();
                    studentG1EyeCounts[bestCandidate.id] = 0;
                    studentNonEyeCounts[bestCandidate.id] = 0;
                }

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
    type: 'error' | 'warning';
}

export interface SuggestionInfo {
    conflict: ConflictInfo;
    suggestedStudentId?: string;
    suggestedReason?: string;
}

export const getScheduleConflicts = (
    students: Student[],
    assignments: Record<string, string>,
    groupCount: number,
    options?: SchedulerOptions
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

        if (task && studentMap.has(studentId)) {
            if (!studentGroups[studentId]) studentGroups[studentId] = new Set();
            studentGroups[studentId].add(groupId);

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
            const eyeExerciseCount = tasks.filter(t => t.task.category === TaskCategory.EYE_EXERCISE).length;
            const nonEyeCount = tasks.length - eyeExerciseCount;
            
            // 计算有效负载
            let effectiveCount = tasks.length;
            const g1EyeTasks = tasks.filter(t => t.task.category === TaskCategory.EYE_EXERCISE && t.task.subCategory === '上午' && t.task.name.includes('高一'));
            if (g1EyeTasks.length >= 2) effectiveCount -= 1;
            
            let isLoadExempt = false;
            if (options?.enableTemporaryMode && 
                [Department.CHAIRMAN, Department.DISCIPLINE, Department.STUDY].includes(student.department)) {
                // 临时模式下，目标部门如果承担了包干区任务，则忽略负载限制
                const hasCleaning = tasks.some(t => t.task.category === TaskCategory.CLEANING);
                if (hasCleaning) isLoadExempt = true;
            }

            const isValidLoad = isLoadExempt || effectiveCount <= 2 || (effectiveCount === 3 && nonEyeCount <= 1);

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
                const validation = canAssign(student, t.task, options);
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
    assignments: Record<string, string>,
    options?: SchedulerOptions
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

        // 查找候选人
        const shuffled = [...students].sort(() => Math.random() - 0.5);

        const candidate = shuffled.find(s => {
            if (s.id === conflict.studentId) return false;
            const check = checkGroupAvailability(s, task, conflict.groupId, assignments, [], options);
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
