export enum Department {
  CHAIRMAN = '主席团', // 包含主席/副主席
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

export enum TimeSlot {
  MORNING_CLEAN = '晨间打扫',
  MORNING_EXERCISE = '上午课间',
  EYE_AM = '上午眼操',
  EYE_PM = '下午眼操',
  EVENING = '晚自习',
}

export interface Student {
  id: string;
  name: string;
  department: Department;
  grade: number; // 1, 2, 3
  classNum: number; // 1-6
  pinyinInitials?: string; // 用于拼音搜索
}

export interface TaskDefinition {
  id: string;
  category: TaskCategory;
  subCategory: string; // 例如 "室外", "上午"
  name: string; // 例如 "点位1", "高一(1-3班)"
  timeSlot: TimeSlot; // 时间段，用于冲突检测
  
  // 限制条件
  allowedDepartments: Department[];
  forbiddenGrade?: number; // 例如：高一不能检查高一的晚自习
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
