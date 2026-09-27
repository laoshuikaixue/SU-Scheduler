export const formatClassName = (grade: number, classNum: number): string => {
    const gradeMap = ['', '一', '二', '三'];
    const g = gradeMap[grade] || grade;
    return `${g}${classNum}班`;
};

const GRADE_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const gradeLabel = (grade: number): string => {
    return `高${GRADE_CN[grade] || grade}`;
};

// 不带“高”字的班级写法，如 二（3）班
export const formatClassLabel = (grade: number, classNum: number): string => {
    return `${GRADE_CN[grade] || grade}（${classNum}）班`;
};

// 把用户输入的年级（高二 / 2 / 高2）解析为数字年级，无法识别时返回 null
export const parseGradeInput = (raw: string): number | null => {
    const text = raw.trim().replace(/[年级班]/g, '').replace(/^高/, '');
    if (!text) return null;
    if (/^\d+$/.test(text)) {
        const num = parseInt(text, 10);
        return num > 0 ? num : null;
    }
    const index = GRADE_CN.indexOf(text);
    return index > 0 ? index : null;
};

// 旧版数据升级：室外检查由单个「公共区域」(clean-out) 拆分为「公共区域1/2」(clean-out-1/2)，
// 原有的单条分配迁移到公共区域1，公共区域2 留空待排
export const migrateAssignments = (assignments: Record<string, string>): Record<string, string> => {
    const migrated: Record<string, string> = {};
    Object.entries(assignments).forEach(([key, sid]) => {
        const [taskId, ...rest] = key.split('::');
        const newTaskId = taskId === 'clean-out' ? 'clean-out-1' : taskId;
        migrated[[newTaskId, ...rest].join('::')] = sid;
    });
    return migrated;
};
