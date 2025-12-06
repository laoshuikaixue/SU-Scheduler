import { Department, TaskCategory, TaskDefinition, Student, TimeSlot } from './types';

// 生成 ID 的辅助函数
const uid = () => Math.random().toString(36).substr(2, 9);

// 负责室内课间操的特殊部门
export const SPECIAL_DEPARTMENTS = [
  Department.CHAIRMAN,
  Department.ART,
  Department.CLUBS,
  Department.SPORTS,
];

// 负责包干区、眼操、晚自习的常规部门
export const REGULAR_DEPARTMENTS = [
  Department.DISCIPLINE,
  Department.STUDY,
];

// 生成模拟学生的辅助函数
const generateMockStudents = (): Student[] => {
  const students: Student[] = [];
  // 增加常规部门权重以确保覆盖包干区/眼操/晚自习
  // 常规: 纪检部, 学习部
  // 特殊: 主席团, 文宣部, 社联部, 体育部
  const depts = [
    Department.DISCIPLINE, Department.STUDY, 
    Department.DISCIPLINE, Department.STUDY, 
    Department.DISCIPLINE, Department.STUDY,
    Department.DISCIPLINE, Department.STUDY,
    Department.CHAIRMAN, Department.ART, Department.CLUBS, Department.SPORTS
  ];
  
  const firstNames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜';
  const lastNames = '伟芳娜敏静丽强军杰明超秀娟英华慧巧美娜静淑惠珠翠雅芝玉萍红娥玲芬芳燕彩春菊兰凤洁梅琳素云莲真环雪荣爱妹霞香月莺媛艳瑞凡佳嘉琼勤珍贞莉桂娣叶璧璐娅琦晶妍茜秋珊莎锦黛青倩婷姣婉娴瑾颖露瑶怡婵雁蓓纨仪荷丹蓉眉君琴蕊薇菁梦岚苑婕馨瑗琰韵融园艺咏卿聪澜纯毓悦昭冰爽琬茗羽希宁欣飘育滢馥筠柔竹霭凝晓欢霄枫芸菲寒伊亚宜可姬舒影荔枝思丽';
  
  for (let i = 0; i < 90; i++) {
    const dept = depts[i % depts.length];
    const grade = (i % 3) + 1;
    const classNum = (i % 10) + 1; // 1-10 班，减少班级冲突
    const surname = firstNames[i % firstNames.length];
    const name = surname + lastNames[i % lastNames.length];
    
    students.push({
      id: `mock-${i}`,
      name: name,
      department: dept,
      grade,
      classNum,
      pinyinInitials: '' // 在 App.tsx 中填充
    });
  }
  return students;
};

// 模板模拟数据
export const MOCK_STUDENTS: Student[] = generateMockStudents();

const GRADE_CN = ['', '一', '二', '三'];

export const ALL_TASKS: TaskDefinition[] = [
  // --- 1. 包干区 (Cleaning) ---
  {
    id: 'clean-out',
    category: TaskCategory.CLEANING,
    subCategory: '室外',
    name: '公共区域',
    timeSlot: TimeSlot.MORNING_CLEAN,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },
  {
    id: 'clean-in',
    category: TaskCategory.CLEANING,
    subCategory: '室内',
    name: '教学楼',
    timeSlot: TimeSlot.MORNING_CLEAN,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },
  {
    id: 'clean-late-1',
    category: TaskCategory.CLEANING,
    subCategory: '迟到',
    name: '点位1',
    timeSlot: TimeSlot.MORNING_CLEAN,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },
  {
    id: 'clean-late-2',
    category: TaskCategory.CLEANING,
    subCategory: '迟到',
    name: '点位2',
    timeSlot: TimeSlot.MORNING_CLEAN,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },

  // --- 2. 课间操 (Interval Exercise) ---
  {
    id: 'ex-out-1',
    category: TaskCategory.INTERVAL_EXERCISE,
    subCategory: '室外',
    name: '点位1',
    timeSlot: TimeSlot.MORNING_EXERCISE,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },
  {
    id: 'ex-out-2',
    category: TaskCategory.INTERVAL_EXERCISE,
    subCategory: '室外',
    name: '点位2',
    timeSlot: TimeSlot.MORNING_EXERCISE,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },
  {
    id: 'ex-out-3',
    category: TaskCategory.INTERVAL_EXERCISE,
    subCategory: '室外',
    name: '点位3',
    timeSlot: TimeSlot.MORNING_EXERCISE,
    allowedDepartments: REGULAR_DEPARTMENTS,
  },
  // 室内 (1-5楼)
  ...[1, 2, 3, 4, 5].map(floor => ({
    id: `ex-in-${floor}`,
    category: TaskCategory.INTERVAL_EXERCISE,
    subCategory: '室内',
    name: `${['', '一', '二', '三', '四', '五'][floor]}楼`,
    timeSlot: TimeSlot.MORNING_EXERCISE,
    allowedDepartments: SPECIAL_DEPARTMENTS, // 仅特殊部门负责室内课间操
  })),

  // --- 3. 眼保健操 (Eye Exercise) ---
  // 上午: 高一, 高二. 下午: 高一, 高二, 高三. 分为 1-3, 4-6 班组.
  ...[1, 2].flatMap(grade => [
    {
      id: `eye-am-g${grade}-a`,
      category: TaskCategory.EYE_EXERCISE,
      subCategory: '上午',
      name: `高${GRADE_CN[grade]} (1-3班)`,
      timeSlot: TimeSlot.EYE_AM,
      allowedDepartments: REGULAR_DEPARTMENTS,
      forbiddenClassGroup: { grade, minClass: 1, maxClass: 3 }
    },
    {
      id: `eye-am-g${grade}-b`,
      category: TaskCategory.EYE_EXERCISE,
      subCategory: '上午',
      name: `高${GRADE_CN[grade]} (4-6班)`,
      timeSlot: TimeSlot.EYE_AM,
      allowedDepartments: REGULAR_DEPARTMENTS,
      forbiddenClassGroup: { grade, minClass: 4, maxClass: 6 }
    }
  ]),
  ...[1, 2, 3].flatMap(grade => [
    {
      id: `eye-pm-g${grade}-a`,
      category: TaskCategory.EYE_EXERCISE,
      subCategory: '下午',
      name: `高${GRADE_CN[grade]} (1-3班)`,
      timeSlot: TimeSlot.EYE_PM,
      allowedDepartments: REGULAR_DEPARTMENTS,
      forbiddenClassGroup: { grade, minClass: 1, maxClass: 3 }
    },
    {
      id: `eye-pm-g${grade}-b`,
      category: TaskCategory.EYE_EXERCISE,
      subCategory: '下午',
      name: `高${GRADE_CN[grade]} (4-6班)`,
      timeSlot: TimeSlot.EYE_PM,
      allowedDepartments: REGULAR_DEPARTMENTS,
      forbiddenClassGroup: { grade, minClass: 4, maxClass: 6 }
    }
  ]),

  // --- 4. 晚自习 (Evening Study) ---
  ...[1, 2, 3].map(grade => ({
    id: `even-g${grade}`,
    category: TaskCategory.EVENING_STUDY,
    subCategory: '晚自习',
    name: `高${GRADE_CN[grade]}`,
    timeSlot: TimeSlot.EVENING,
    allowedDepartments: REGULAR_DEPARTMENTS,
    forbiddenGrade: grade,
  })),
];
