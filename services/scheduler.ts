import { Student, TaskDefinition, Assignment, Department, TaskCategory } from '../types';
import { ALL_TASKS, SPECIAL_DEPARTMENTS } from '../constants';

// Helper: Check if student can do task
export const canAssign = (student: Student, task: TaskDefinition): { valid: boolean; reason?: string } => {
  // 1. Department Check
  if (!task.allowedDepartments.includes(student.department)) {
    return { valid: false, reason: '部门职责不符' };
  }

  // 2. Eye Exercise Class Group Conflict
  if (task.forbiddenClassGroup) {
    if (
      student.grade === task.forbiddenClassGroup.grade &&
      student.classNum >= task.forbiddenClassGroup.minClass &&
      student.classNum <= task.forbiddenClassGroup.maxClass
    ) {
      return { valid: false, reason: '需避嫌(本班所在组)' };
    }
  }

  // 3. Evening Grade Conflict
  if (task.forbiddenGrade && student.grade === task.forbiddenGrade) {
    return { valid: false, reason: '需避嫌(本年级)' };
  }

  return { valid: true };
};

// Helper: Distribute students evenly across groups
const distributeStudentsToGroups = (students: Student[], numGroups: number): Student[][] => {
  const groups: Student[][] = Array.from({ length: numGroups }, () => []);
  
  // Sort students by department to ensure even distribution of departments
  const sortedStudents = [...students].sort((a, b) => a.department.localeCompare(b.department));
  
  sortedStudents.forEach((s, idx) => {
    groups[idx % numGroups].push(s);
  });
  
  return groups;
};

export const autoScheduleMultiGroup = (
  students: Student[], 
  currentAssignments: Record<string, string>, // Keys are taskId::groupId
  numGroups: number
): Record<string, string> => {
  const newAssignments = { ...currentAssignments };
  
  // Distribute students into disjoint groups to ensure load balancing
  const studentsPerGroup = distributeStudentsToGroups(students, numGroups);

  const sortedTasks = [...ALL_TASKS].sort((a, b) => {
    // Priority 1: Department constraints (Hardest to fill first)
    // Tasks with fewer allowed departments should be scheduled first
    const deptDiff = a.allowedDepartments.length - b.allowedDepartments.length;
    if (deptDiff !== 0) return deptDiff;

    // Priority 2: Hard constraints (Evening Study has grade restrictions)
    if (a.forbiddenGrade && !b.forbiddenGrade) return -1;
    if (!a.forbiddenGrade && b.forbiddenGrade) return 1;

    return 0;
  });

  // Schedule each group sequentially
  for (let g = 0; g < numGroups; g++) {
    const groupWorkload: Record<string, number> = {};
    const studentCategories: Record<string, Set<TaskCategory>> = {};
    
    // Use ONLY students assigned to this group
    const groupStudents = studentsPerGroup[g];

    // Initialize trackers
    groupStudents.forEach(s => {
        groupWorkload[s.id] = 0;
        studentCategories[s.id] = new Set();
    });
    
    // Scan assignments for this group to populate current workload & categories
    // Note: We assume currentAssignments respect the disjoint groups. 
    // If user manually assigned someone from Group B to Group A, we respect it, 
    // but for auto-scheduling we stick to the pool.
    ALL_TASKS.forEach(task => {
        const key = `${task.id}::${g}`;
        const sid = newAssignments[key];
        if (sid) {
            // If manually assigned student is in our pool, update stats
            if (groupWorkload[sid] !== undefined) {
                groupWorkload[sid] = (groupWorkload[sid] || 0) + 1;
                if (studentCategories[sid]) {
                    studentCategories[sid].add(task.category);
                }
            }
        }
    });

    for (const task of sortedTasks) {
        const key = `${task.id}::${g}`;
        // Skip if already assigned
        if (newAssignments[key]) continue;

        // Find candidates within the group pool
        const candidates = groupStudents.filter(student => {
            // Rule 1: Disjoint Groups - Implicitly handled by `groupStudents` pool.
            
            // Rule 2: Max Workload per group
            // Relaxed to 4 to handle shortages
            if (groupWorkload[student.id] >= 4) return false;

            // Rule 3: Task Specific Constraints
            if (!canAssign(student, task).valid) return false;

            // Rule 4: Category Limit (Prevent one person checking multiple grades for same project)
            if (task.category === TaskCategory.EVENING_STUDY) {
                if (studentCategories[student.id].has(TaskCategory.EVENING_STUDY)) return false;
            }

            return true;
        });

        if (candidates.length === 0) continue;

        // Scoring Candidates
        candidates.sort((a, b) => {
            const loadA = groupWorkload[a.id];
            const loadB = groupWorkload[b.id];
            
            // Preference: Prioritize those with LOWER workload first
            return loadA - loadB;
        });
        
        const bestCandidate = candidates[0];
        newAssignments[key] = bestCandidate.id;
        
        // Update trackers
        groupWorkload[bestCandidate.id]++;
        studentCategories[bestCandidate.id].add(task.category);
    }
  }

  return newAssignments;
};
