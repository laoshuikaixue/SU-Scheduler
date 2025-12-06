export const formatClassName = (grade: number, classNum: number): string => {
    const gradeMap = ['', '一', '二', '三'];
    const g = gradeMap[grade] || grade;
    return `${g}${classNum}班`;
};
