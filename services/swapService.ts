import { Student, TaskDefinition, ScheduleState } from '../types';
import { checkGroupAvailability } from './scheduler';
import { ALL_TASKS } from '../constants';
import { formatClassName } from '../utils';

export interface SwapProposal {
    type: 'MOVE_TO_EMPTY' | 'DIRECT_SWAP';
    targetTaskId: string;
    targetGroupId: number;
    targetStudentId: string | null; // 如果是交换，目标是谁
    description: string;
}

export const findSwapOptions = (
    student: Student,
    currentTaskId: string | null, // 当前要放弃的任务（如果有）
    currentGroupId: number | null, // 当前任务所在的组
    scheduleState: ScheduleState,
    numGroups: number
): SwapProposal[] => {
    const proposals: SwapProposal[] = [];
    const { assignments, students } = scheduleState;

    // 1. 创建一个临时分配映射，其中学生已释放当前任务
    // 这至关重要，因为在检查他们是否可以接受新任务时，不应被他们正在放弃的任务所阻碍。
    const tempAssignments = { ...assignments };
    if (currentTaskId && currentGroupId !== null) {
        const key = `${currentTaskId}::${currentGroupId}`;
        if (tempAssignments[key] === student.id) {
            delete tempAssignments[key];
        }
    }

    // 2. 遍历所有可能的插槽（任务 x 组）
    for (const task of ALL_TASKS) {
        for (let g = 0; g < numGroups; g++) {
            // 跳过当前插槽本身
            if (task.id === currentTaskId && g === currentGroupId) continue;

            const targetKey = `${task.id}::${g}`;
            const targetStudentId = assignments[targetKey]; // 当前谁持有此插槽？

            // 自我交换检查：不能与自己交换
            if (targetStudentId === student.id) continue;

            // 检查学生是否可以接受此目标插槽
            // 我们使用 tempAssignments 是因为我们假设他们放弃了旧任务
            const checkResult = checkGroupAvailability(student, task, g, tempAssignments);

            if (checkResult.valid) {
                if (!targetStudentId) {
                    // 情况 A：空插槽 -> 移动
                    proposals.push({
                        type: 'MOVE_TO_EMPTY',
                        targetTaskId: task.id,
                        targetGroupId: g,
                        targetStudentId: null,
                        description: `移动到第 ${g + 1} 组 - ${task.category} ${task.name}`
                    });
                } else {
                    // 情况 B：已占用 -> 尝试直接交换
                    // 我们需要检查目标学生（持有者）是否可以接受 *原始* 插槽（如果存在）
                    // 如果 currentTaskId 为空（学生只是想添加任务），我们不能交换，只能移动到空位。

                    if (currentTaskId && currentGroupId !== null) {
                        const targetStudent = students.find(s => s.id === targetStudentId);
                        if (targetStudent) {
                            // 为目标学生准备临时映射：
                            // 他们放弃 'targetKey'，我们要看看他们是否可以接受 'currentKey'。
                            // 注意：映射应反映 'student' 也放弃了 'currentKey'。
                            // 所以从 'tempAssignments' 开始（其中 student 是空闲的）。
                            // 然后从 targetKey 中移除 targetStudent。
                            const swapAssignments = { ...tempAssignments };
                            if (swapAssignments[targetKey] === targetStudentId) {
                                delete swapAssignments[targetKey];
                            }
                            
                            // 现在检查 targetStudent 是否可以接受原始任务
                            // 原始任务是 currentGroupId 中的 currentTaskId。
                            const originalTask = ALL_TASKS.find(t => t.id === currentTaskId);
                            if (originalTask) {
                                const reverseCheck = checkGroupAvailability(
                                    targetStudent, 
                                    originalTask, 
                                    currentGroupId, 
                                    swapAssignments
                                );

                                if (reverseCheck.valid) {
                                    const targetStudentName = `${targetStudent.name} (${formatClassName(targetStudent.grade, targetStudent.classNum)})`;
                                    proposals.push({
                                        type: 'DIRECT_SWAP',
                                        targetTaskId: task.id,
                                        targetGroupId: g,
                                        targetStudentId: targetStudent.id,
                                        description: `与 ${targetStudentName} (第${g+1}组) 交换 - ${task.category} ${task.name}`
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return proposals;
};
