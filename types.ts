export enum Department {
  CHAIRMAN = '主席团', // Includes Chairman/Vice
  DISCIPLINE = '纪检部',
  STUDY = '学习部',
  ART = '文宣部',
  CLUBS = '社联部',
  SPORTS = '体育部',
}

export enum TaskCategory {
  CLEANING = '包干区',
  INTERVAL_EXERCISE = '课间操',
  EYE_EXERCISE = '眼保健操',
  EVENING_STUDY = '晚自习',
}

export interface Student {
  id: string;
  name: string;
  department: Department;
  grade: number; // 1, 2, 3
  classNum: number; // 1-6
  pinyinInitials?: string; // For "zs" matching
}

export interface TaskDefinition {
  id: string;
  category: TaskCategory;
  subCategory: string; // e.g., "室外", "上午"
  name: string; // e.g., "点位1", "高一(1-3班)"
  
  // Constraints
  allowedDepartments: Department[];
  forbiddenGrade?: number; // e.g., Evening study for G1 cannot be checked by G1
  forbiddenClassGroup?: {
    grade: number;
    minClass: number;
    maxClass: number;
  };
}

export interface Assignment {
  taskId: string;
  studentId: string | null;
}

export interface ScheduleState {
  students: Student[];
  assignments: Record<string, string>; // taskId -> studentId
}
