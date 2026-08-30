import React, {useState} from 'react';
import {Department, Student} from '../types';
import {gradeLabel} from '../utils';
import Modal from './Modal';

interface Props {
    student: Student;
    onClose: () => void;
    onSave: (student: Student) => void;
}

const COMMON_GRADES = [1, 2, 3];
const ROLE_SUGGESTIONS = ['主席', '副主席', '部长', '副部长', '干事'];

const StudentEditModal: React.FC<Props> = ({student, onClose, onSave}) => {
    const [name, setName] = useState(student.name);
    const [department, setDepartment] = useState<Department>(student.department);
    const [grade, setGrade] = useState(student.grade);
    const [classNum, setClassNum] = useState(student.classNum);
    const [role, setRole] = useState(student.role || '');

    const gradeOptions = COMMON_GRADES.includes(student.grade)
        ? COMMON_GRADES
        : [...COMMON_GRADES, student.grade].sort((a, b) => a - b);

    const departments = Object.values(Department) as string[];
    const departmentOptions = departments.includes(student.department)
        ? departments
        : [...departments, student.department];

    const trimmedName = name.trim();
    const isValid = trimmedName.length > 0 && classNum > 0;

    const handleSave = () => {
        if (!isValid) return;
        onSave({
            ...student,
            name: trimmedName,
            department,
            grade,
            classNum,
            role: role.trim() || undefined
        });
    };

    const inputClass = "w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-primary focus:border-primary outline-none";

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="编辑成员"
            width="w-[22rem]"
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid}
                        className="px-4 py-2 bg-primary hover:bg-blue-600 text-white rounded text-sm transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        保存
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
                    <input
                        type="text"
                        autoFocus
                        className={inputClass}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                    {!trimmedName && (
                        <p className="mt-1 text-xs text-red-500">姓名不能为空</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">部门</label>
                    <select
                        className={inputClass}
                        value={department}
                        onChange={e => setDepartment(e.target.value as Department)}
                    >
                        {departmentOptions.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">年级</label>
                        <select
                            className={inputClass}
                            value={grade}
                            onChange={e => setGrade(Number(e.target.value))}
                        >
                            {gradeOptions.map(g => (
                                <option key={g} value={g}>{gradeLabel(g)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">班级</label>
                        <input
                            type="number"
                            min={1}
                            className={inputClass}
                            value={classNum}
                            onChange={e => setClassNum(Number(e.target.value))}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">职务</label>
                    <input
                        type="text"
                        list="role-suggestions"
                        placeholder="如 部长 / 干事，留空表示未填写"
                        className={inputClass}
                        value={role}
                        onChange={e => setRole(e.target.value)}
                    />
                    <datalist id="role-suggestions">
                        {ROLE_SUGGESTIONS.map(item => (
                            <option key={item} value={item}/>
                        ))}
                    </datalist>
                </div>
            </div>
        </Modal>
    );
};

export default StudentEditModal;
