import { Student, TaskDefinition, ScheduleState } from '../types';
import { checkGroupAvailability } from './scheduler';
import { ALL_TASKS } from '../constants';

export interface SwapProposal {
    type: 'MOVE_TO_EMPTY' | 'DIRECT_SWAP';
    targetTaskId: string;
    targetGroupId: number;
    targetStudentId: string | null; // If swap, who are we swapping with
    description: string;
}

export const findSwapOptions = (
    student: Student,
    currentTaskId: string | null, // The task to give up (if any)
    currentGroupId: number | null, // The group of the current task
    scheduleState: ScheduleState,
    numGroups: number
): SwapProposal[] => {
    const proposals: SwapProposal[] = [];
    const { assignments, students } = scheduleState;

    // 1. Create a temporary assignment map where the student has RELEASED the current task
    // This is crucial because when checking if they can take a new task, they shouldn't be blocked by the one they are giving up.
    const tempAssignments = { ...assignments };
    if (currentTaskId && currentGroupId !== null) {
        const key = `${currentTaskId}::${currentGroupId}`;
        if (tempAssignments[key] === student.id) {
            delete tempAssignments[key];
        }
    }

    // 2. Iterate through all possible slots (Task x Group)
    for (const task of ALL_TASKS) {
        for (let g = 0; g < numGroups; g++) {
            // Skip the current slot itself
            if (task.id === currentTaskId && g === currentGroupId) continue;

            const targetKey = `${task.id}::${g}`;
            const targetStudentId = assignments[targetKey]; // Who currently holds this slot?

            // Self-swap check: Cannot swap with yourself
            if (targetStudentId === student.id) continue;

            // Check if the student can take this target slot
            // We use tempAssignments because we assume they gave up their old task
            const checkResult = checkGroupAvailability(student, task, g, tempAssignments);

            if (checkResult.valid) {
                if (!targetStudentId) {
                    // Case A: Empty Slot -> Move
                    proposals.push({
                        type: 'MOVE_TO_EMPTY',
                        targetTaskId: task.id,
                        targetGroupId: g,
                        targetStudentId: null,
                        description: `移动到第 ${g + 1} 组 - ${task.category} ${task.name}`
                    });
                } else {
                    // Case B: Occupied -> Try Direct Swap
                    // We need to check if the target student (holder) can take the *original* slot (if it exists)
                    // If currentTaskId is null (student just wants to ADD a task), we can't swap, only take empty.
                    // Unless... "Swap" means I take yours, and you take... nothing? No, that's stealing.
                    // "Swap" means I take yours, you take mine.

                    if (currentTaskId && currentGroupId !== null) {
                        const targetStudent = students.find(s => s.id === targetStudentId);
                        if (targetStudent) {
                            // Prepare a temp map for the target student:
                            // They give up 'targetKey', and we want to see if they can take 'currentKey'.
                            // Note: The map should reflect that 'student' has also given up 'currentKey'.
                            // So start with 'tempAssignments' (where student is free).
                            // Then remove targetStudent from targetKey.
                            const swapAssignments = { ...tempAssignments };
                            if (swapAssignments[targetKey] === targetStudentId) {
                                delete swapAssignments[targetKey];
                            }
                            
                            // Now check if targetStudent can take the original task
                            // The original task is currentTaskId in currentGroupId.
                            const originalTask = ALL_TASKS.find(t => t.id === currentTaskId);
                            if (originalTask) {
                                const reverseCheck = checkGroupAvailability(
                                    targetStudent, 
                                    originalTask, 
                                    currentGroupId, 
                                    swapAssignments
                                );

                                if (reverseCheck.valid) {
                                    proposals.push({
                                        type: 'DIRECT_SWAP',
                                        targetTaskId: task.id,
                                        targetGroupId: g,
                                        targetStudentId: targetStudent.id,
                                        description: `与 ${targetStudent.name} (第${g+1}组) 交换 - ${task.category} ${task.name}`
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
