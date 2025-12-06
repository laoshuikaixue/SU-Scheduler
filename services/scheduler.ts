import { Student, TaskDefinition, Assignment, Department, TaskCategory, TimeSlot } from '../types';
import { ALL_TASKS, SPECIAL_DEPARTMENTS } from '../constants';

// 辅助函数: 检查学生是否可以执行任务
export const canAssign = (student: Student, task: TaskDefinition): { valid: boolean; reason?: string } => {
  // 1. 部门职责检查
  if (!task.allowedDepartments.includes(student.department)) {
    return { valid: false, reason: '部门职责不符' };
  }

  // 2. 眼操班级组冲突检查
  if (task.forbiddenClassGroup) {
    if (
      student.grade === task.forbiddenClassGroup.grade &&
      student.classNum >= task.forbiddenClassGroup.minClass &&
      student.classNum <= task.forbiddenClassGroup.maxClass
    ) {
      return { valid: false, reason: '需避嫌(本班所在组)' };
    }
  }

  // 3. 晚自习年级冲突检查
  if (task.forbiddenGrade && student.grade === task.forbiddenGrade) {
    return { valid: false, reason: '需避嫌(本年级)' };
  }

  return { valid: true };
};

// 辅助函数: 将学生均匀分配到各组
// 增加随机性以确保每次结果不同
const distributeStudentsToGroups = (students: Student[], numGroups: number): Student[][] => {
  const groups: Student[][] = Array.from({ length: numGroups }, () => []);
  
  // 先打乱学生顺序
  const shuffledStudents = [...students].sort(() => Math.random() - 0.5);
  
  // 按部门分组，确保部门分布均匀
  const deptMap: Record<string, Student[]> = {};
  shuffledStudents.forEach(s => {
    if (!deptMap[s.department]) deptMap[s.department] = [];
    deptMap[s.department].push(s);
  });
  
  // 轮询分配各部门成员到组
  Object.values(deptMap).forEach(deptStudents => {
      deptStudents.forEach((s, idx) => {
          groups[idx % numGroups].push(s);
      });
  });
  
  return groups;
};

export const autoScheduleMultiGroup = (
  students: Student[], 
  currentAssignments: Record<string, string>, // 键格式: taskId::groupId
  numGroups: number
): Record<string, string> => {
  // 复制当前分配（通常为空，因为是重新编排）
  const newAssignments = { ...currentAssignments };
  
  // 将学生分配到不重叠的组池中
  const studentsPerGroup = distributeStudentsToGroups(students, numGroups);

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
            // 如果当前任务是眼操，优先给已经有包干区的人 (凑成 包干+眼操)
            if (task.category === TaskCategory.EYE_EXERCISE) {
                const hasCleanA = studentCategories[a.id].has(TaskCategory.CLEANING);
                const hasCleanB = studentCategories[b.id].has(TaskCategory.CLEANING);
                if (hasCleanA && !hasCleanB) return -1;
                if (!hasCleanA && hasCleanB) return 1;
            }

            return 0;
        });
        
        const bestCandidate = candidates[0];
        newAssignments[key] = bestCandidate.id;
        
        // 更新追踪器
        groupWorkload[bestCandidate.id]++;
        studentCategories[bestCandidate.id].add(task.category);
        studentTimeSlots[bestCandidate.id].add(task.timeSlot);
    }
  }

  return newAssignments;
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
      tasks: {id: string, task: TaskDefinition}[], 
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
            groupUsage[groupId][studentId] = { tasks: [] };
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
                     reason: `多组任务 (${Array.from(groups).map(g=>g+1).join(',')})`,
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

          const { tasks } = usage;

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
  conflicts: ConflictInfo[]
): SuggestionInfo[] => {
  const suggestions: SuggestionInfo[] = [];
  
  conflicts.forEach(conflict => {
    if (conflict.type === 'warning') return; // 警告通常不需要自动建议替换
    if (conflict.taskId === 'time-conflict') {
        suggestions.push({
            conflict,
            suggestedReason: '请移除冲突的任务'
        });
        return;
    }

    const task = ALL_TASKS.find(t => t.id === conflict.taskId);
    if (!task) return;
    
    const candidate = students.find(s => canAssign(s, task).valid);
    
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
