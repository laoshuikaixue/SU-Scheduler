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
